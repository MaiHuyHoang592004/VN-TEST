import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { processAppUninstalled } from "./app-uninstalled.handler.js";
import { setupComplianceContext, ingestionRecord, createOrder, createShipmentForOrder, cleanupComplianceContext } from "./compliance-test-support.js";

test("app/uninstalled disconnects the store, clears credentials, and dead-letters pending Store/Shipment outbox events", async () => {
  const ctx = await setupComplianceContext("uninstall");
  const order = await createOrder(ctx, "gid://shopify/Order/1");
  const { shipment } = await createShipmentForOrder(ctx, order.id);

  const storeRefreshEvent = await prisma.outboxEvent.create({ data: {
    organizationId: ctx.organizationId, eventKey: `token.refresh:${ctx.storeId}`,
    aggregateType: "Store", aggregateId: ctx.storeId, handler: "shopify.token.refresh", payload: { storeId: ctx.storeId },
  } });
  const shipmentSyncEvent = await prisma.outboxEvent.create({ data: {
    organizationId: ctx.organizationId, eventKey: `shipment.sync-plan:${shipment.id}`,
    aggregateType: "Shipment", aggregateId: shipment.id, handler: "shopify.fulfillment.plan", payload: { shipmentId: shipment.id },
  } });
  // A different store's pending event must survive untouched.
  const otherCtx = await setupComplianceContext("uninstall-other");
  const untouchedEvent = await prisma.outboxEvent.create({ data: {
    organizationId: otherCtx.organizationId, eventKey: `token.refresh:${otherCtx.storeId}`,
    aggregateType: "Store", aggregateId: otherCtx.storeId, handler: "shopify.token.refresh", payload: { storeId: otherCtx.storeId },
  } });

  try {
    const record = await ingestionRecord(ctx, "app/uninstalled", { id: 999, domain: `${ctx.slug}.myshopify.com` });
    await processAppUninstalled(record.id);

    const store = await prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    assert.equal(store.status, "DISCONNECTED");
    assert.ok(store.uninstalledAt);
    assert.equal(store.accessTokenEnc, null);
    assert.equal(store.refreshTokenEnc, null);

    const refreshed = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: storeRefreshEvent.id } });
    assert.equal(refreshed.status, "DEAD_LETTER");
    assert.equal(refreshed.lastError, "store_uninstalled");
    const syncEvent = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: shipmentSyncEvent.id } });
    assert.equal(syncEvent.status, "DEAD_LETTER");
    const other = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: untouchedEvent.id } });
    assert.equal(other.status, "PENDING");

    const audit = await prisma.auditLog.findFirst({ where: { entityId: ctx.storeId, action: "store.uninstalled" } });
    assert.ok(audit);

    // Idempotent: running again does not throw and keeps the same end state.
    await processAppUninstalled(record.id);
    const storeAgain = await prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    assert.equal(storeAgain.status, "DISCONNECTED");
  } finally {
    await prisma.outboxEvent.deleteMany({ where: { id: untouchedEvent.id } });
    await cleanupComplianceContext(otherCtx);
    await cleanupComplianceContext(ctx);
  }
});
