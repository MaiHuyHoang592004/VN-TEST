import { test, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { routeOrder } from "./routing.service.ts";
import { setupRouting, createOrder, createFacility, cleanupRouting, type RoutingTestContext } from "./routing-test-support.ts";

let ctx: RoutingTestContext;
let facilityIds: string[];
afterEach(async () => { if (ctx) await cleanupRouting(ctx, facilityIds ?? []); });
after(async () => { await prisma.$disconnect(); });

test("no active facility covers every SKU: NO_ROUTE, one INTERNAL exception, no Fulfillment", async () => {
  ctx = await setupRouting();
  const facility = await createFacility({ capabilities: [{ skuId: ctx.skuIds[0] }] }); // missing skuIds[1]
  facilityIds = [facility.id];
  const order = await createOrder(ctx, [{ skuId: ctx.skuIds[0], quantity: 1 }, { skuId: ctx.skuIds[1], quantity: 1 }]);

  const result = await routeOrder(order.id);

  const decision = await prisma.routingDecision.findUniqueOrThrow({ where: { id: result.routingDecisionId } });
  assert.equal(decision.status, "NO_ROUTE");
  assert.equal(decision.selectedFacilityId, null);
  assert.equal(result.fulfillmentId, undefined);
  assert.equal(await prisma.fulfillment.count({ where: { orderId: order.id } }), 0);
  const exceptions = await prisma.exceptionCase.findMany({ where: { orderId: order.id } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].code, "NO_ELIGIBLE_FACILITY");
  assert.equal(exceptions[0].visibility, "INTERNAL");
});

test("an INACTIVE facility is never a candidate even with full capability", async () => {
  ctx = await setupRouting();
  const facility = await createFacility({ status: "INACTIVE", capabilities: ctx.skuIds.map((skuId) => ({ skuId })) });
  facilityIds = [facility.id];
  const order = await createOrder(ctx, [{ skuId: ctx.skuIds[0], quantity: 1 }]);

  const result = await routeOrder(order.id);
  const decision = await prisma.routingDecision.findUniqueOrThrow({ where: { id: result.routingDecisionId } });
  assert.equal(decision.status, "NO_ROUTE");
});

test("a disabled capability row makes the facility ineligible for that SKU", async () => {
  ctx = await setupRouting();
  const facility = await createFacility({ capabilities: [{ skuId: ctx.skuIds[0], enabled: false }] });
  facilityIds = [facility.id];
  const order = await createOrder(ctx, [{ skuId: ctx.skuIds[0], quantity: 1 }]);

  const result = await routeOrder(order.id);
  const decision = await prisma.routingDecision.findUniqueOrThrow({ where: { id: result.routingDecisionId } });
  assert.equal(decision.status, "NO_ROUTE");
});

test("selecting the single eligible facility creates SELECTED + one Fulfillment with one item per order line", async () => {
  ctx = await setupRouting();
  const facility = await createFacility({ capabilities: ctx.skuIds.map((skuId) => ({ skuId })) });
  facilityIds = [facility.id];
  const order = await createOrder(ctx, [{ skuId: ctx.skuIds[0], quantity: 2 }, { skuId: ctx.skuIds[1], quantity: 3 }]);

  const result = await routeOrder(order.id);

  const decision = await prisma.routingDecision.findUniqueOrThrow({ where: { id: result.routingDecisionId } });
  assert.equal(decision.status, "SELECTED");
  assert.equal(decision.selectedFacilityId, facility.id);
  assert.equal(decision.strategyVersion, "v1-single-facility");
  const fulfillment = await prisma.fulfillment.findUniqueOrThrow({ where: { id: result.fulfillmentId }, include: { items: true } });
  assert.equal(fulfillment.orderId, order.id);
  assert.equal(fulfillment.facilityId, facility.id);
  assert.equal(fulfillment.kind, "ORIGINAL");
  assert.equal(fulfillment.status, "QUEUED");
  assert.equal(fulfillment.routingDecisionId, decision.id);
  assert.equal(fulfillment.items.length, 2);
  assert.deepEqual(fulfillment.items.map((i) => i.quantity).sort(), [2, 3]);
  assert.equal(await prisma.exceptionCase.count({ where: { orderId: order.id } }), 0);
});

test("higher explicit priority wins over lower priority regardless of lead time", async () => {
  ctx = await setupRouting();
  const slow = await createFacility({ code: "AAA-slow-high-priority", capabilities: [{ skuId: ctx.skuIds[0], priority: 10, leadTimeHours: 100 }] });
  const fast = await createFacility({ code: "ZZZ-fast-low-priority", capabilities: [{ skuId: ctx.skuIds[0], priority: 1, leadTimeHours: 1 }] });
  facilityIds = [slow.id, fast.id];
  const order = await createOrder(ctx, [{ skuId: ctx.skuIds[0], quantity: 1 }]);

  const result = await routeOrder(order.id);
  const decision = await prisma.routingDecision.findUniqueOrThrow({ where: { id: result.routingDecisionId } });
  assert.equal(decision.selectedFacilityId, slow.id);
});

test("equal priority ties break on lower leadTimeHours", async () => {
  ctx = await setupRouting();
  const fast = await createFacility({ code: "AAA-fast", capabilities: [{ skuId: ctx.skuIds[0], priority: 5, leadTimeHours: 4 }] });
  const slow = await createFacility({ code: "ZZZ-slow", capabilities: [{ skuId: ctx.skuIds[0], priority: 5, leadTimeHours: 24 }] });
  facilityIds = [fast.id, slow.id];
  const order = await createOrder(ctx, [{ skuId: ctx.skuIds[0], quantity: 1 }]);

  const result = await routeOrder(order.id);
  const decision = await prisma.routingDecision.findUniqueOrThrow({ where: { id: result.routingDecisionId } });
  assert.equal(decision.selectedFacilityId, fast.id);
});

test("equal priority and lead time break deterministically on facility code", async () => {
  ctx = await setupRouting();
  const b = await createFacility({ code: "B-facility", capabilities: [{ skuId: ctx.skuIds[0], priority: 5, leadTimeHours: 10 }] });
  const a = await createFacility({ code: "A-facility", capabilities: [{ skuId: ctx.skuIds[0], priority: 5, leadTimeHours: 10 }] });
  facilityIds = [b.id, a.id];
  const order = await createOrder(ctx, [{ skuId: ctx.skuIds[0], quantity: 1 }]);

  const result = await routeOrder(order.id);
  const decision = await prisma.routingDecision.findUniqueOrThrow({ where: { id: result.routingDecisionId } });
  assert.equal(decision.selectedFacilityId, a.id);
});

test("calling routeOrder again after SELECTED creates a second decision (caller decides whether to re-route)", async () => {
  ctx = await setupRouting();
  const facility = await createFacility({ capabilities: ctx.skuIds.map((skuId) => ({ skuId })) });
  facilityIds = [facility.id];
  const order = await createOrder(ctx, [{ skuId: ctx.skuIds[0], quantity: 1 }]);
  await routeOrder(order.id);
  await routeOrder(order.id);
  assert.equal(await prisma.routingDecision.count({ where: { orderId: order.id } }), 2);
  assert.equal(await prisma.fulfillment.count({ where: { orderId: order.id } }), 2);
});
