import { createNormalizedOrder } from "./orders-create.handler.js";
import { settleOrderRecord, withOrderRecord } from "./order-record-transaction.js";

export async function processOrdersUpdated(recordId: string): Promise<void> {
  await withOrderRecord(recordId, async (tx, record, normalized) => {
    const order = await tx.order.findUnique({ where: { storeId_externalId: { storeId: record.storeId, externalId: normalized.externalId } } });
    if (!order) {
      await createNormalizedOrder(tx, record, normalized);
      const settled = await tx.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
      if (settled.status === "ACCEPTED") {
        await tx.ingestionRecord.updateMany({ where: {
          organizationId: record.organizationId, storeId: record.storeId, status: "HELD",
          normalizedPayload: { path: ["externalId"], equals: normalized.externalId },
        }, data: { status: "ACCEPTED", resultOrderId: settled.resultOrderId, processedAt: new Date(), lockedUntil: null, errorCode: null, errorMessage: null } });
      }
      return;
    }
    if (order.channelUpdatedAt && new Date(normalized.channelUpdatedAt) <= order.channelUpdatedAt) {
      await settleOrderRecord(tx, record.id, normalized, order.id, "DUPLICATE");
      return;
    }
    await tx.order.update({ where: { id: order.id }, data: {
      channelUpdatedAt: normalized.channelUpdatedAt, channelFinancialStatus: normalized.channelFinancialStatus,
    } });
    await settleOrderRecord(tx, record.id, normalized, order.id, "ACCEPTED");
  });
}
