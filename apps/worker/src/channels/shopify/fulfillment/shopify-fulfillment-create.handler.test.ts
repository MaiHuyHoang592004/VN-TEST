import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { createShopifyFulfillment } from "./shopify-fulfillment-create.handler.js";
import { BusinessOutboxError, RetryableOutboxError } from "../../../queue/outbox-errors.js";
import { setupShipmentContext, cacheFulfillmentOrderLine, makeCreateEvent, cleanupShipmentContext, type ShipmentContext } from "./shipment-sync-test-support.js";

const contexts: ShipmentContext[] = [];
async function setup(label: string, opts?: { quantity?: number }) {
  const ctx = await setupShipmentContext(label, opts);
  contexts.push(ctx);
  return ctx;
}
after(async () => {
  for (const ctx of contexts) await cleanupShipmentContext(ctx);
  await prisma.$disconnect();
});

function withFakeFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => { globalThis.fetch = real; });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (n: string) => headers[n] ?? null }, json: async () => body, text: async () => JSON.stringify(body) };
}

test("sends exactly one fulfillmentCreate mutation, saves the returned gid, and decrements the cache", async () => {
  const ctx = await setup("happy");
  await cacheFulfillmentOrderLine(ctx);
  const event = await makeCreateEvent(ctx);
  let calls = 0;

  await withFakeFetch(
    (async () => { calls++; return jsonResponse(200, { data: { fulfillmentCreate: { fulfillment: { id: "gid://shopify/Fulfillment/1" }, userErrors: [] } } }); }) as unknown as typeof fetch,
    () => createShopifyFulfillment(event),
  );

  assert.equal(calls, 1);
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: ctx.shipment.id } });
  assert.equal(shipment.externalFulfillmentId, "gid://shopify/Fulfillment/1");

  const line = await prisma.shopifyFulfillmentOrderLine.findUniqueOrThrow({ where: { fulfillmentOrderLineItemId: `gid://shopify/FulfillmentOrderLineItem/${ctx.orderItem.id}` } });
  assert.equal(line.remainingQuantity, 0, "decremented by the shipped quantity");

  const attempts = await prisma.deliveryAttempt.findMany({ where: { outboxEventId: event.id } });
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "DELIVERED");
});

test("userErrors dead-letters and opens one merchant CHANNEL_SYNC_FAILED exception; the shipment is left unsynced", async () => {
  const ctx = await setup("user-errors");
  await cacheFulfillmentOrderLine(ctx);
  const event = await makeCreateEvent(ctx);

  await assert.rejects(
    () => withFakeFetch(
      (async () => jsonResponse(200, { data: { fulfillmentCreate: { fulfillment: null, userErrors: [{ field: ["fulfillment"], message: "already fulfilled" }] } } })) as unknown as typeof fetch,
      () => createShopifyFulfillment(event),
    ),
    BusinessOutboxError,
  );

  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: ctx.shipment.id } });
  assert.equal(shipment.externalFulfillmentId, null);

  const exceptions = await prisma.exceptionCase.findMany({ where: { organizationId: ctx.organizationId, code: "CHANNEL_SYNC_FAILED" } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].subjectKey, `shipment:${ctx.shipment.id}`);
});

test("a 429 with Retry-After surfaces as a RetryableOutboxError carrying that delay", async () => {
  const ctx = await setup("throttled");
  await cacheFulfillmentOrderLine(ctx);
  const event = await makeCreateEvent(ctx);

  await assert.rejects(
    () => withFakeFetch(
      (async () => jsonResponse(429, {}, { "Retry-After": "12" })) as unknown as typeof fetch,
      () => createShopifyFulfillment(event),
    ),
    (err: unknown) => { assert.ok(err instanceof RetryableOutboxError); assert.equal(err.retryAfterSeconds, 12); return true; },
  );
  const attempts = await prisma.deliveryAttempt.findMany({ where: { outboxEventId: event.id } });
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "FAILED");
});

test("an already-synced single-location-group shipment returns without a second mutation", async () => {
  const ctx = await setup("already-synced");
  await cacheFulfillmentOrderLine(ctx);
  await prisma.shipment.update({ where: { id: ctx.shipment.id }, data: { externalFulfillmentId: "gid://shopify/Fulfillment/existing" } });
  const event = await makeCreateEvent(ctx);
  let calls = 0;

  await withFakeFetch((async () => { calls++; return jsonResponse(200, {}); }) as unknown as typeof fetch, () => createShopifyFulfillment(event));

  assert.equal(calls, 0, "must not call Shopify a second time");
});
