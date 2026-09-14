import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma, type FulfillmentStatus } from "@fulfillflow/db";
import { processOrdersCreate } from "./orders-create.handler.js";
import { processOrdersCancelled } from "./orders-cancelled.handler.js";
import { setupOrders, cleanupOrders, delivery, type OrderTestContext } from "./order-test-support.js";

let ctx: OrderTestContext;
let facilityId: string;
beforeEach(async () => {
  ctx = await setupOrders();
  facilityId = (await prisma.facility.create({ data: { code: crypto.randomUUID(), name: "M3 cancellation", countryCode: "US" } })).id;
});
afterEach(async () => {
  if (!ctx) return;
  await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.inventoryMovement.deleteMany({ where: { facilityId } });
  await prisma.inventoryReservation.deleteMany({ where: { facilityId } });
  await prisma.fulfillment.deleteMany({ where: { facilityId } });
  await prisma.inventoryBalance.deleteMany({ where: { facilityId } });
  await prisma.facility.delete({ where: { id: facilityId } });
  await cleanupOrders(ctx);
});
after(async () => { await prisma.$disconnect(); });

async function orderWithFulfillment(status: FulfillmentStatus) {
  const initial = await delivery(ctx);
  await processOrdersCreate(initial.id);
  const order = await prisma.order.findFirstOrThrow({ where: { storeId: ctx.storeId }, include: { items: true } });
  const fulfillment = await prisma.fulfillment.create({ data: {
    orderId: order.id, facilityId, status,
    items: { create: { orderItemId: order.items[0].id, quantity: 2 } },
  }, include: { items: true } });
  const reservation = await prisma.inventoryReservation.create({ data: {
    fulfillmentItemId: fulfillment.items[0].id, facilityId, inventoryItemId: ctx.skuIds[0], quantity: 2,
  } });
  await prisma.inventoryBalance.create({ data: { facilityId, inventoryItemId: ctx.skuIds[0], onHand: 10, reserved: 2 } });
  return { order, fulfillment, reservation };
}
async function cancel() {
  const record = await delivery(ctx, "order-paid-mapped", "orders/cancelled", { updated_at: "2026-09-14T08:05:00Z", cancelled_at: "2026-09-14T08:05:00Z" });
  await processOrdersCancelled(record.id);
  return record;
}
for (const status of ["QUEUED", "BLOCKED"] as const) {
  test(`${status} cancellation releases reservations and cancels exactly once`, async () => {
    const { order, fulfillment, reservation } = await orderWithFulfillment(status);
    await cancel();
    await cancel();
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "CANCELLED");
    assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "CANCELLED");
    assert.equal((await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status, "RELEASED");
    const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId } });
    assert.equal(balance.reserved.toString(), "0");
    assert.equal(balance.onHand.toString(), "10");
    const movements = await prisma.inventoryMovement.findMany({ where: { reservationId: reservation.id } });
    assert.equal(movements.length, 1);
    assert.equal(movements[0].reason, "RELEASE");
    assert.equal(movements[0].reservedDelta.toString(), "-2");
    assert.equal(await prisma.exceptionCase.count({ where: { orderId: order.id } }), 0);
  });
}
for (const status of ["IN_PRODUCTION", "READY_TO_SHIP", "PARTIALLY_SHIPPED", "SHIPPED"] as const) {
  test(`${status} cancellation preserves fulfillment and opens CANCELLATION_CONFLICT`, async () => {
    const { order, fulfillment, reservation } = await orderWithFulfillment(status);
    await cancel();
    await cancel();
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "OPEN");
    assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, status);
    assert.equal((await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status, "ACTIVE");
    const exceptions = await prisma.exceptionCase.findMany({ where: { orderId: order.id } });
    assert.equal(exceptions.length, 1);
    assert.equal(exceptions[0].code, "CANCELLATION_CONFLICT");
    assert.equal(exceptions[0].visibility, "MERCHANT");
  });
}
test("cancellation without fulfillments cancels the order", async () => {
  const initial = await delivery(ctx);
  await processOrdersCreate(initial.id);
  await cancel();
  const order = await prisma.order.findFirstOrThrow({ where: { storeId: ctx.storeId } });
  assert.equal(order.status, "CANCELLED");
  assert.equal(order.cancelledAt?.toISOString(), "2026-09-14T08:05:00.000Z");
});
