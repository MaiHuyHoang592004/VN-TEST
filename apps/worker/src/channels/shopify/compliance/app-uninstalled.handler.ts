/**
 * `app/uninstalled`: Shopify revoked this store's access. Disconnect it,
 * drop the now-worthless encrypted credentials, and stop any pending work
 * that would otherwise retry against a dead token forever — pending
 * Store-aggregate events (e.g. a queued token refresh) and pending
 * Shipment-aggregate events (shopify.fulfillment.plan/create) for every
 * Shipment under this store's orders. Idempotent: re-running settles into
 * the same DISCONNECTED state and dead-letters whatever is still PENDING
 * (nothing, the second time).
 */
import { prisma } from "@fulfillflow/db";

export async function processAppUninstalled(recordId: string): Promise<void> {
  const record = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: recordId } });
  const store = await prisma.store.findUniqueOrThrow({ where: { id: record.storeId } });

  await prisma.$transaction(async (tx) => {
    const before = { status: store.status, uninstalledAt: store.uninstalledAt };
    await tx.store.update({
      where: { id: store.id },
      data: {
        status: "DISCONNECTED",
        uninstalledAt: store.uninstalledAt ?? new Date(),
        accessTokenEnc: null,
        refreshTokenEnc: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
      },
    });

    await tx.outboxEvent.updateMany({
      where: { status: "PENDING", aggregateType: "Store", aggregateId: store.id },
      data: { status: "DEAD_LETTER", lastError: "store_uninstalled" },
    });

    const shipments = await tx.shipment.findMany({
      where: { fulfillment: { order: { storeId: store.id } } },
      select: { id: true },
    });
    if (shipments.length > 0) {
      await tx.outboxEvent.updateMany({
        where: { status: "PENDING", aggregateType: "Shipment", aggregateId: { in: shipments.map((s) => s.id) } },
        data: { status: "DEAD_LETTER", lastError: "store_uninstalled" },
      });
    }

    await tx.auditLog.create({ data: {
      organizationId: store.organizationId, action: "store.uninstalled",
      entityType: "Store", entityId: store.id, before, after: { status: "DISCONNECTED" },
    } });
  });
}
