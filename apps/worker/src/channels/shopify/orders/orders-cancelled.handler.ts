import { settleOrderRecord, withOrderRecord } from "./order-record-transaction.js";
import { openOrderException } from "./order-exception.js";

export async function processOrdersCancelled(recordId: string): Promise<void> {
  await withOrderRecord(recordId, async (tx, record, normalized) => {
    const order = await tx.order.findUnique({ where: { storeId_externalId: { storeId: record.storeId, externalId: normalized.externalId } } });
    if (!order) {
      await tx.ingestionRecord.update({ where: { id: record.id }, data: {
        status: "DUPLICATE", normalizedPayload: normalized, processedAt: new Date(), lockedUntil: null,
      } });
      return;
    }
    // Equal timestamps across distinct topics are not duplicates: an update may
    // arrive before the cancellation for the same channel revision.
    if (order.status === "CANCELLED" || (order.channelUpdatedAt && new Date(normalized.channelUpdatedAt) < order.channelUpdatedAt)) {
      await settleOrderRecord(tx, record.id, normalized, order.id, "DUPLICATE");
      return;
    }
    await tx.$queryRaw`SELECT id FROM "Fulfillment" WHERE "orderId" = ${order.id} ORDER BY id FOR UPDATE`;
    const fulfillments = await tx.fulfillment.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } });
    const conflicts: string[] = [];
    for (const fulfillment of fulfillments) {
      if (fulfillment.status === "CANCELLED") continue;
      if (fulfillment.status !== "QUEUED" && fulfillment.status !== "BLOCKED") {
        conflicts.push(fulfillment.id);
        continue;
      }
      await tx.$queryRaw`
        SELECT r.id FROM "InventoryReservation" r JOIN "FulfillmentItem" i ON i.id = r."fulfillmentItemId"
        WHERE i."fulfillmentId" = ${fulfillment.id} AND r.status = 'ACTIVE' ORDER BY r.id FOR UPDATE OF r`;
      const reservations = await tx.inventoryReservation.findMany({ where: {
        fulfillmentItem: { fulfillmentId: fulfillment.id }, status: "ACTIVE",
      }, orderBy: [{ facilityId: "asc" }, { inventoryItemId: "asc" }] });
      for (const reservation of reservations) {
        const remaining = reservation.quantity.minus(reservation.consumedQuantity);
        const balance = await tx.inventoryBalance.updateMany({ where: {
          facilityId: reservation.facilityId, inventoryItemId: reservation.inventoryItemId, reserved: { gte: remaining },
        }, data: { reserved: { decrement: remaining } } });
        if (balance.count !== 1) throw new Error("Reservation balance cannot be released");
        await tx.inventoryMovement.create({ data: {
          facilityId: reservation.facilityId, inventoryItemId: reservation.inventoryItemId,
          reservationId: reservation.id, fulfillmentId: fulfillment.id, reason: "RELEASE",
          reservedDelta: remaining.negated(), idempotencyKey: `release:${reservation.id}`,
        } });
        await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED" } });
      }
      await tx.fulfillment.update({ where: { id: fulfillment.id }, data: { status: "CANCELLED" } });
    }
    if (conflicts.length) {
      await openOrderException(tx, {
        organizationId: record.organizationId, orderId: order.id, ingestionRecordId: record.id,
        code: "CANCELLATION_CONFLICT", message: "Cancellation requires review because fulfillment has started",
        details: { fulfillmentIds: conflicts },
      });
    }
    await tx.order.update({ where: { id: order.id }, data: {
      channelUpdatedAt: normalized.channelUpdatedAt,
      ...(conflicts.length ? {} : { status: "CANCELLED", cancelledAt: normalized.cancelledAt ?? normalized.channelUpdatedAt }),
    } });
    await settleOrderRecord(tx, record.id, normalized, order.id, "ACCEPTED");
  });
}
