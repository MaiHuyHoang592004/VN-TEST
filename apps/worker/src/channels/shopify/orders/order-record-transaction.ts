import { prisma, type Prisma, type IngestionRecord } from "@fulfillflow/db";
import { normalizeShopifyOrder, type NormalizedShopifyOrder } from "./shopify-order-normalizer.js";

export async function withOrderRecord<T>(
  recordId: string,
  handle: (tx: Prisma.TransactionClient, record: IngestionRecord, normalized: NormalizedShopifyOrder) => Promise<T>,
): Promise<T | undefined> {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.ingestionRecord.findUniqueOrThrow({ where: { id: recordId } });
    if (initial.status !== "PENDING") return undefined;
    await tx.store.findFirstOrThrow({ where: { id: initial.storeId, organizationId: initial.organizationId } });
    const normalized = normalizeShopifyOrder(initial.rawPayload);
    // Entity lock comes before row locks, including HELD rows recovered by updates.
    // The existing unique constraints remain the final guard on canonical identity.
    const key = `shopify:${initial.storeId}:${normalized.externalId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    await tx.$queryRaw`SELECT id FROM "IngestionRecord" WHERE id = ${recordId} FOR UPDATE`;
    const record = await tx.ingestionRecord.findUniqueOrThrow({ where: { id: recordId } });
    if (record.status !== "PENDING") return undefined;
    await tx.$queryRaw`SELECT id FROM "Order" WHERE "storeId" = ${record.storeId} AND "externalId" = ${normalized.externalId} FOR UPDATE`;
    return handle(tx, record, normalized);
  });
}

export async function settleOrderRecord(tx: Prisma.TransactionClient, recordId: string, normalized: NormalizedShopifyOrder, orderId: string, status: "ACCEPTED" | "DUPLICATE") {
  await tx.ingestionRecord.update({ where: { id: recordId }, data: {
    status, normalizedPayload: normalized, resultOrderId: orderId,
    processedAt: new Date(), lockedUntil: null, errorCode: null, errorMessage: null,
  } });
}
