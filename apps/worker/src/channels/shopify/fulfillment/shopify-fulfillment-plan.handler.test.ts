import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { planShopifyFulfillment } from "./shopify-fulfillment-plan.handler.js";
import { setupShipmentContext, cacheFulfillmentOrderLine, makePlanEvent, cleanupShipmentContext, type ShipmentContext } from "./shipment-sync-test-support.js";

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

test("groups a single-location shipment into one child shopify.fulfillment.create event and marks the plan event SENT", async () => {
  const ctx = await setup("single-group");
  await cacheFulfillmentOrderLine(ctx);
  const event = await makePlanEvent(ctx);

  await planShopifyFulfillment(event);

  const children = await prisma.outboxEvent.findMany({ where: { aggregateId: ctx.shipment.id, handler: "shopify.fulfillment.create" } });
  assert.equal(children.length, 1);
  assert.equal(children[0].eventKey, `shipment.sync:${ctx.shipment.id}:gid://shopify/Location/1`);
  assert.equal(children[0].status, "PENDING");
  const payload = children[0].payload as { shipmentId: string; assignedLocationId: string; allocations: Array<{ quantity: number }> };
  assert.equal(payload.shipmentId, ctx.shipment.id);
  assert.equal(payload.assignedLocationId, "gid://shopify/Location/1");
  assert.equal(payload.allocations.length, 1);
  assert.equal(payload.allocations[0].quantity, ctx.shipmentItem.quantity);

  const planRow = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(planRow.status, "SENT");
});

test("an unresolved FulfillmentOrder cache is a plain retryable error, not a business exception", async () => {
  const ctx = await setup("unresolved");
  const event = await makePlanEvent(ctx);
  await assert.rejects(() => planShopifyFulfillment(event), /unresolved/);
  const exceptions = await prisma.exceptionCase.findMany({ where: { organizationId: ctx.organizationId } });
  assert.equal(exceptions.length, 0);
});

test("a shipped quantity exceeding Shopify's remaining quantity settles CHANNEL_SYNC_FAILED and emits no create event", async () => {
  const ctx = await setup("mismatch", { quantity: 3 });
  await cacheFulfillmentOrderLine(ctx, { remainingQuantity: 1 });
  const event = await makePlanEvent(ctx);

  await planShopifyFulfillment(event);

  const children = await prisma.outboxEvent.findMany({ where: { aggregateId: ctx.shipment.id, handler: "shopify.fulfillment.create" } });
  assert.equal(children.length, 0);

  const exceptions = await prisma.exceptionCase.findMany({ where: { organizationId: ctx.organizationId, code: "CHANNEL_SYNC_FAILED" } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].subjectKey, `shipment:${ctx.shipment.id}`);

  const planRow = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(planRow.status, "SENT");
});
