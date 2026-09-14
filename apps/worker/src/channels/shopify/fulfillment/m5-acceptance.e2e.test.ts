import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { HandlerRegistry } from "../../../queue/handler-registry.js";
import { OutboxLoop } from "../../../queue/outbox-loop.js";
import { resolveForOrder } from "./shopify-fulfillment-order-resolver.js";
import { planShopifyFulfillment } from "./shopify-fulfillment-plan.handler.js";
import { createShopifyFulfillment } from "./shopify-fulfillment-create.handler.js";
import { setupShipmentContext, makePlanEvent, cleanupShipmentContext, type ShipmentContext } from "./shipment-sync-test-support.js";

const contexts: ShipmentContext[] = [];
after(async () => {
  for (const ctx of contexts) await cleanupShipmentContext(ctx);
  await prisma.$disconnect();
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
}

/**
 * Gate M5 (worker-side equivalent of HANDOVER-M4's operator acceptance
 * gate): resolve a Shopify FulfillmentOrder line into the Task 17 cache,
 * then drive the real OutboxLoop through the shopify.fulfillment.plan ->
 * shopify.fulfillment.create pipeline (Task 18) exactly as apps/worker's
 * main.ts would, with a fake Shopify GraphQL server standing in for the
 * dev store this session has no credentials for. Asserts the shipment ends
 * up carrying Shopify's returned Fulfillment gid and the cached remaining
 * quantity is decremented — the two externally-visible effects Task 19's
 * live dev-store checklist verifies by reading the Shopify admin instead.
 */
test("M5 acceptance gate: resolve -> plan -> create syncs a shipment to Shopify end-to-end", async () => {
  const ctx = await setupShipmentContext("acceptance");
  contexts.push(ctx);
  const lineItemGid = `gid://shopify/FulfillmentOrderLineItem/${ctx.orderItem.id}`;

  const realFetch = globalThis.fetch;
  globalThis.fetch = ((url: string) => {
    if (String(url).includes("/graphql.json")) {
      // Both requests in this test hit the same endpoint; branch on which
      // one Task 17's resolver vs. Task 18's create handler would send by
      // inspecting call order via a queue instead of the query text, to
      // keep this fake server trivial.
      return Promise.resolve(jsonResponse(nextGraphqlResponse()));
    }
    return realFetch(url);
  }) as unknown as typeof fetch;

  const responses: unknown[] = [
    { data: { order: { fulfillmentOrders: { nodes: [{
      id: `gid://shopify/FulfillmentOrder/${ctx.orderItem.id}`,
      assignedLocation: { location: { id: "gid://shopify/Location/1", fulfillmentService: null } },
      lineItems: { nodes: [{ id: lineItemGid, remainingQuantity: ctx.shipmentItem.quantity, lineItem: { id: ctx.orderItem.externalLineId } }] },
    }] } } } },
    { data: { fulfillmentCreate: { fulfillment: { id: "gid://shopify/Fulfillment/acceptance-1" }, userErrors: [] } } },
  ];
  function nextGraphqlResponse() { return responses.shift(); }

  try {
    await resolveForOrder(ctx.order.id, { force: true });

    const registry = new HandlerRegistry()
      .register("shopify.fulfillment.plan", planShopifyFulfillment)
      .register("shopify.fulfillment.create", createShopifyFulfillment);
    const loop = new OutboxLoop(prisma, registry, { batchSize: 10, leaseSeconds: 30, maxAttempts: 3, pollMs: 10 });

    await makePlanEvent(ctx);
    const firstTick = await loop.tick();
    assert.equal(firstTick, 1, "claimed and processed the plan event");

    const secondTick = await loop.tick();
    assert.equal(secondTick, 1, "claimed and processed the child create event");
  } finally {
    globalThis.fetch = realFetch;
  }

  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: ctx.shipment.id } });
  assert.equal(shipment.externalFulfillmentId, "gid://shopify/Fulfillment/acceptance-1");

  const line = await prisma.shopifyFulfillmentOrderLine.findUniqueOrThrow({ where: { fulfillmentOrderLineItemId: lineItemGid } });
  assert.equal(line.remainingQuantity, 0);

  const planEvent = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: ctx.shipment.id, handler: "shopify.fulfillment.plan" } });
  assert.equal(planEvent.status, "SENT");
  const createEvent = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: ctx.shipment.id, handler: "shopify.fulfillment.create" } });
  assert.equal(createEvent.status, "SENT");
});
