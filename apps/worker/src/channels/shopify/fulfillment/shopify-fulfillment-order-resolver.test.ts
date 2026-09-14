import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { resolveForOrder, FulfillmentOrderNotReadyError } from "./shopify-fulfillment-order-resolver.js";
import { setupFulfillmentOrderContext, cleanupFulfillmentOrderContext, fakeTokenManager, type FulfillmentOrderContext } from "./fulfillment-test-support.js";

const contexts: FulfillmentOrderContext[] = [];
async function setup(label: string) {
  const ctx = await setupFulfillmentOrderContext(label);
  contexts.push(ctx);
  return ctx;
}
after(async () => {
  for (const ctx of contexts) await cleanupFulfillmentOrderContext(ctx);
  await prisma.$disconnect();
});

function fulfillmentOrderNode(overrides: Partial<{
  id: string; locationId: string; fulfillmentService: boolean; lineItemGid: string; remainingQuantity: number;
}> = {}) {
  // Line item ids default to a suffix derived from the (test-unique) OrderItem
  // gid, so independent tests never collide on the real @unique constraint —
  // matching Shopify's own guarantee that a FulfillmentOrderLineItem id never
  // moves to a different original order line.
  const lineItemGid = overrides.lineItemGid ?? "PLACEHOLDER";
  const suffix = lineItemGid.split("/").pop();
  return {
    id: overrides.id ?? `gid://shopify/FulfillmentOrder/${suffix}`,
    assignedLocation: {
      location: {
        id: overrides.locationId ?? "gid://shopify/Location/1",
        fulfillmentService: overrides.fulfillmentService ? { id: "gid://shopify/FulfillmentService/1" } : null,
      },
    },
    lineItems: {
      nodes: [{
        id: `gid://shopify/FulfillmentOrderLineItem/${suffix}`,
        remainingQuantity: overrides.remainingQuantity ?? 2,
        lineItem: { id: lineItemGid },
      }],
    },
  };
}

test("cache miss queries Shopify, upserts the cache row, and maps back to the OrderItem via externalLineId", async () => {
  const ctx = await setup("miss");
  const orderItem = ctx.order.items[0];
  let calls = 0;
  const resolved = await resolveForOrder(ctx.order.id, undefined, {
    tokenManager: fakeTokenManager(),
    queryFulfillmentOrders: async () => { calls++; return [fulfillmentOrderNode({ lineItemGid: orderItem.externalLineId! })]; },
  });
  assert.equal(calls, 1);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].orderItemId, orderItem.id);
  assert.equal(resolved[0].remainingQuantity, 2);
  assert.equal(resolved[0].assignedLocationId, "gid://shopify/Location/1");

  const row = await prisma.shopifyFulfillmentOrderLine.findUnique({ where: { fulfillmentOrderLineItemId: resolved[0].fulfillmentOrderLineItemId } });
  assert.ok(row);
  assert.equal(row!.orderItemId, orderItem.id);
});

test("cache hit returns cached rows without calling Shopify again", async () => {
  const ctx = await setup("hit");
  const orderItem = ctx.order.items[0];
  await resolveForOrder(ctx.order.id, undefined, {
    tokenManager: fakeTokenManager(),
    queryFulfillmentOrders: async () => [fulfillmentOrderNode({ lineItemGid: orderItem.externalLineId! })],
  });

  let secondCallCount = 0;
  const resolved = await resolveForOrder(ctx.order.id, undefined, {
    tokenManager: fakeTokenManager(),
    queryFulfillmentOrders: async () => { secondCallCount++; return []; },
  });
  assert.equal(secondCallCount, 0, "cache hit must not call Shopify");
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].orderItemId, orderItem.id);
});

test("force:true bypasses the cache and re-queries Shopify", async () => {
  const ctx = await setup("force");
  const orderItem = ctx.order.items[0];
  await resolveForOrder(ctx.order.id, undefined, {
    tokenManager: fakeTokenManager(),
    queryFulfillmentOrders: async () => [fulfillmentOrderNode({ lineItemGid: orderItem.externalLineId!, remainingQuantity: 2 })],
  });

  let calls = 0;
  const resolved = await resolveForOrder(ctx.order.id, { force: true }, {
    tokenManager: fakeTokenManager(),
    queryFulfillmentOrders: async () => { calls++; return [fulfillmentOrderNode({ lineItemGid: orderItem.externalLineId!, remainingQuantity: 1 })]; },
  });
  assert.equal(calls, 1, "force must call Shopify even though the cache was already complete");
  assert.equal(resolved[0].remainingQuantity, 1, "the existing cache row was updated in place, not duplicated");

  const rows = await prisma.shopifyFulfillmentOrderLine.findMany({ where: { orderItemId: orderItem.id } });
  assert.equal(rows.length, 1);
});

test("an empty FulfillmentOrder result is retryable, not a business failure", async () => {
  const ctx = await setup("empty");
  await assert.rejects(
    () => resolveForOrder(ctx.order.id, undefined, { tokenManager: fakeTokenManager(), queryFulfillmentOrders: async () => [] }),
    FulfillmentOrderNotReadyError,
  );
});

test("a fulfillment-service-assigned location surfaces one merchant CHANNEL_SYNC_FAILED exception and caches nothing for it", async () => {
  const ctx = await setup("unsupported");
  const orderItem = ctx.order.items[0];
  const resolved = await resolveForOrder(ctx.order.id, undefined, {
    tokenManager: fakeTokenManager(),
    queryFulfillmentOrders: async () => [fulfillmentOrderNode({ lineItemGid: orderItem.externalLineId!, fulfillmentService: true })],
  });
  assert.equal(resolved.length, 0, "no supported FulfillmentOrder lines to cache");

  const cached = await prisma.shopifyFulfillmentOrderLine.findMany({ where: { orderItemId: orderItem.id } });
  assert.equal(cached.length, 0);

  const exceptions = await prisma.exceptionCase.findMany({ where: { organizationId: ctx.organizationId, code: "CHANNEL_SYNC_FAILED" } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].visibility, "MERCHANT");
  assert.equal(exceptions[0].subjectKey, `order:${ctx.order.id}`);
});

test("repeating the unsupported-location resolve does not open a second exception", async () => {
  const ctx = await setup("unsupported-repeat");
  const orderItem = ctx.order.items[0];
  const call = () => resolveForOrder(ctx.order.id, { force: true }, {
    tokenManager: fakeTokenManager(),
    queryFulfillmentOrders: async () => [fulfillmentOrderNode({ lineItemGid: orderItem.externalLineId!, fulfillmentService: true })],
  });
  await call();
  await call();
  const exceptions = await prisma.exceptionCase.findMany({ where: { organizationId: ctx.organizationId, code: "CHANNEL_SYNC_FAILED" } });
  assert.equal(exceptions.length, 1);
});
