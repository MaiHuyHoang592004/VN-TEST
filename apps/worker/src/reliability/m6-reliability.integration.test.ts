/**
 * M6 Task 24 — reliability integration suite.
 *
 * The plan's own file path (`tests/reliability/shopify.integration.test.ts`)
 * doesn't fit this repo: there is no root-level `tests/` workspace, and a
 * webhook-to-worker integration test needs direct access to
 * `@fulfillflow/core`/`@fulfillflow/db` and the worker's own handlers, which
 * only `apps/worker`'s own workspace has. Placed alongside the M3/M4/M5
 * "acceptance gate" tests (`m3-acceptance.e2e.test.ts`, etc.) for the same
 * reason those live where they do.
 *
 * Most of the plan's ten Task 24 bullets are already covered, thoroughly, by
 * existing tests closer to the code they exercise — duplicating them here
 * would just be slower, more expensive proof of the same fact. This file
 * adds only the three that were genuinely untested as *integrations* (not
 * merely as units):
 *
 *   - duplicate webhook -> one ingestion record/order:
 *     apps/api webhooks.controller.test.ts (HTTP-level dedupe) +
 *     orders-create.handler.test.ts (duplicate delivery -> DUPLICATE).
 *   - two concurrent token refreshers -> one rotation winner:
 *     libs/core token-manager.test.ts.
 *   - stale orders/updated -> ignored:
 *     orders-updated.handler.test.ts.
 *   - unknown SKU -> mapping -> automatic requeue -> accepted:
 *     NEW below. M3's own scope explicitly excluded a mapping HTTP API
 *     (HANDOVER-M3), so this proves the underlying mechanism — a
 *     StoreSkuMapping insert plus resetting the stuck record to PENDING,
 *     which is exactly what that API would have done — actually requeues
 *     and resolves, not the (nonexistent) endpoint.
 *   - 20 concurrent inventory reservations, stock 10 -> exactly 10 succeed:
 *     libs/core inventory-reservation.service.test.ts (the atomic SQL guard
 *     itself). NEW below re-proves it through the real ingestion-accepted
 *     path (routeAndReserve), which is a different, real integration seam.
 *   - FulfillmentOrder unavailable -> retry -> later available -> sync
 *     succeeds: shopify-fulfillment-order-resolver tests (Task 17).
 *   - same Shipment plan/create path invoked twice -> one mutation:
 *     m5-acceptance.e2e.test.ts + shopify-fulfillment-create.handler.test.ts
 *     "already-synced" case.
 *   - uninstall clears credentials and prevents new normal outbound work:
 *     app-uninstalled.handler.test.ts covers "clears credentials" and
 *     "dead-letters pending work". NEW below adds "prevents *new* work" —
 *     a fresh withAccessToken call after uninstall must fail fast.
 *   - redact purges PII: shop-redact/customers-redact handler tests.
 *   - one worker crashes after claim; expired lease lets another reclaim:
 *     ingestion-claim-loop.test.ts (the shared claim primitive both the
 *     ingestion and outbox loops use).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { encryptToken, routeAndReserve } from "@fulfillflow/core";
import { processOrdersCreate } from "../channels/shopify/orders/orders-create.handler.js";
import { processAppUninstalled } from "../channels/shopify/compliance/app-uninstalled.handler.js";
import { shopifyTokenManager } from "../channels/shopify/shopify-client.js";
import { setupOrders, delivery, cleanupOrders, type OrderTestContext } from "../channels/shopify/orders/order-test-support.js";

test("unknown SKU blocks the order, then mapping it requeues the stuck record and it resumes to ACCEPTED", async () => {
  const ctx = await setupOrders();
  const record = await delivery(ctx, "order-paid-unmapped", "orders/create");

  try {
    await processOrdersCreate(record.id);
    const blocked = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
    assert.equal(blocked.status, "EXCEPTION");
    assert.equal(blocked.errorCode, "SKU_NOT_MAPPED");
    assert.equal(await prisma.order.count({ where: { organizationId: ctx.organizationId } }), 0);
    const exception = await prisma.exceptionCase.findFirstOrThrow({ where: { ingestionRecordId: record.id, code: "SKU_NOT_MAPPED" } });
    assert.equal(exception.status, "OPEN");

    // What a real SKU-mapping API (out of scope per HANDOVER-M3) would do on save:
    // add the mapping, requeue the stuck record, resolve the open exception.
    await prisma.storeSkuMapping.create({ data: { storeId: ctx.storeId, skuId: ctx.skuIds[1]!, externalVariantId: "gid://shopify/ProductVariant/3999" } });
    await prisma.ingestionRecord.update({ where: { id: record.id }, data: { status: "PENDING", nextAttemptAt: new Date(), errorCode: null, errorMessage: null } });
    await prisma.exceptionCase.update({ where: { id: exception.id }, data: { status: "RESOLVED", resolutionAction: "RETRY", resolvedAt: new Date() } });

    await processOrdersCreate(record.id);
    const accepted = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
    assert.equal(accepted.status, "ACCEPTED");
    assert.ok(accepted.resultOrderId);
    assert.equal(await prisma.order.count({ where: { organizationId: ctx.organizationId } }), 1);
  } finally {
    await cleanupOrders(ctx);
  }
});

test("20 concurrent orders against a FROM_STOCK sku with stock=10, routed and reserved through the real accepted-order path, leave exactly 10 QUEUED and 10 BLOCKED", async () => {
  const ctx = await setupOrders();
  const facility = await prisma.facility.create({ data: { code: `m6-rel-${crypto.randomUUID()}`, name: "reliability", countryCode: "US" } });
  const stockItemId = ctx.skuIds[0]!;
  await prisma.sku.update({ where: { id: stockItemId }, data: { supplyMode: "FROM_STOCK" } });
  await prisma.facilitySkuCapability.create({ data: { facilityId: facility.id, skuId: stockItemId, enabled: true } });
  await prisma.inventoryBalance.create({ data: { facilityId: facility.id, inventoryItemId: stockItemId, onHand: 10 } });

  const orders = await Promise.all(Array.from({ length: 20 }, () => prisma.order.create({
    data: {
      organizationId: ctx.organizationId, storeId: ctx.storeId, externalId: crypto.randomUUID(), sourceKey: `test:${crypto.randomUUID()}`,
      currency: "USD", placedAt: new Date(), items: { create: [{ skuId: stockItemId, title: "item", quantity: 1 }] },
    },
    include: { items: true },
  })));

  try {
    await Promise.all(orders.map((o) => routeAndReserve(o.id)));

    const fulfillments = await prisma.fulfillment.findMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    const queued = fulfillments.filter((f) => f.status === "QUEUED");
    const blocked = fulfillments.filter((f) => f.status === "BLOCKED");
    assert.equal(fulfillments.length, 20);
    assert.equal(queued.length, 10);
    assert.equal(blocked.length, 10);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({ where: { facilityId_inventoryItemId: { facilityId: facility.id, inventoryItemId: stockItemId } } });
    assert.equal(balance.reserved.toString(), "10");
    assert.equal(balance.onHand.toString(), "10");

    const insufficientStockExceptions = await prisma.exceptionCase.count({ where: { organizationId: ctx.organizationId, code: "INSUFFICIENT_STOCK" } });
    assert.equal(insufficientStockExceptions, 10);
  } finally {
    const orderIds = orders.map((o) => o.id);
    await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
    await prisma.inventoryReservation.deleteMany({ where: { fulfillmentItem: { fulfillmentId: { in: (await prisma.fulfillment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })).map((f) => f.id) } } } });
    await prisma.inventoryMovement.deleteMany({ where: { facilityId: facility.id } });
    await prisma.fulfillmentItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.fulfillment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.routingDecision.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.inventoryBalance.deleteMany({ where: { facilityId: facility.id } });
    await prisma.facilitySkuCapability.deleteMany({ where: { facilityId: facility.id } });
    await prisma.facility.delete({ where: { id: facility.id } });
    await cleanupOrders(ctx);
  }
});

test("after app/uninstalled, a fresh withAccessToken call for that store fails fast instead of attempting a new Shopify request", async () => {
  const slug = `m6-rel-uninstall-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: {
    organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com`, status: "ACTIVE",
    accessTokenEnc: new Uint8Array(encryptToken("shpat_live", "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=")),
  } });
  const record = await prisma.ingestionRecord.create({ data: {
    organizationId: org.id, storeId: store.id, source: "SHOPIFY_WEBHOOK", topic: "app/uninstalled", dedupeKey: crypto.randomUUID(),
  } });

  try {
    await processAppUninstalled(record.id);

    let called = false;
    await assert.rejects(
      () => shopifyTokenManager.withAccessToken(store.id, async () => { called = true; }),
      /not ACTIVE/,
    );
    assert.equal(called, false, "the callback must never run — no new Shopify request should be attempted for a disconnected store");
  } finally {
    await prisma.ingestionRecord.deleteMany({ where: { organizationId: org.id } });
    await prisma.store.delete({ where: { id: store.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
