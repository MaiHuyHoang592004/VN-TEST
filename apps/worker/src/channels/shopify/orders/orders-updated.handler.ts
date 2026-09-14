import { createNormalizedOrder, type OrderAccepted } from "./orders-create.handler.js";
import { settleOrderRecord, withOrderRecord } from "./order-record-transaction.js";
import { validateAddressCompleteness } from "./address-completeness.validator.js";
import { openOrderException } from "./order-exception.js";
import { routeAndReserve } from "@fulfillflow/core";

export async function processOrdersUpdated(recordId: string): Promise<void> {
  const accepted = await withOrderRecord(recordId, async (tx, record, normalized): Promise<OrderAccepted | undefined> => {
    const order = await tx.order.findUnique({ where: { storeId_externalId: { storeId: record.storeId, externalId: normalized.externalId } } });
    if (!order) {
      const created = await createNormalizedOrder(tx, record, normalized);
      const settled = await tx.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
      if (settled.status === "ACCEPTED") {
        await tx.ingestionRecord.updateMany({ where: {
          organizationId: record.organizationId, storeId: record.storeId, status: "HELD",
          normalizedPayload: { path: ["externalId"], equals: normalized.externalId },
        }, data: { status: "ACCEPTED", resultOrderId: settled.resultOrderId, processedAt: new Date(), lockedUntil: null, errorCode: null, errorMessage: null } });
      }
      return created;
    }
    if (order.channelUpdatedAt && new Date(normalized.channelUpdatedAt) <= order.channelUpdatedAt) {
      await settleOrderRecord(tx, record.id, normalized, order.id, "DUPLICATE");
      return;
    }
    const address = await tx.orderAddress.findUnique({ where: { orderId: order.id } });
    const changed = !address || Object.entries(normalized.address).some(([field, value]) => address[field as keyof typeof normalized.address] !== value);
    if (changed) {
      const shipment = await tx.shipment.findFirst({ where: { fulfillment: { orderId: order.id } }, select: { id: true } });
      if (shipment) {
        await openOrderException(tx, {
          organizationId: record.organizationId, orderId: order.id, ingestionRecordId: record.id,
          code: "ADDRESS_CHANGED_AFTER_SHIP", message: "Channel shipping address changed after a shipment was created",
          details: { proposedAddress: normalized.address, shipmentId: shipment.id },
        });
      } else {
        const validation = validateAddressCompleteness(normalized.address);
        const data = {
          ...normalized.address, countryCode: validation.validationErrors.countryCode ? null : normalized.address.countryCode,
          validationStatus: "UNVERIFIED" as const, validationErrors: validation.validationErrors,
        };
        await tx.orderAddress.upsert({ where: { orderId: order.id }, create: { orderId: order.id, ...data }, update: data });
      }
    }
    await tx.order.update({ where: { id: order.id }, data: {
      channelUpdatedAt: normalized.channelUpdatedAt, channelFinancialStatus: normalized.channelFinancialStatus,
    } });
    await settleOrderRecord(tx, record.id, normalized, order.id, "ACCEPTED");
    return undefined;
  });
  if (accepted) await routeAndReserve(accepted.orderId);
}
