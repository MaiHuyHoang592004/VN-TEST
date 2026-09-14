import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { processOrdersCreate } from "./orders-create.handler.js";
import { processOrdersUpdated } from "./orders-updated.handler.js";
import { setupOrders, cleanupOrders, delivery, fixture, type OrderTestContext } from "./order-test-support.js";

let ctx: OrderTestContext;
beforeEach(async () => { ctx = await setupOrders(); });
afterEach(async () => { if (ctx) await cleanupOrders(ctx); });
after(async () => { await prisma.$disconnect(); });
test("address change before any shipment replaces the address and sets UNVERIFIED", async () => {
  const initial = await delivery(ctx);
  await processOrdersCreate(initial.id);
  const order = await prisma.order.findFirstOrThrow({ where: { storeId: ctx.storeId }, include: { shippingAddress: true } });
  const record = await delivery(ctx, "order-paid-mapped", "orders/updated", {
    updated_at: "2026-09-14T08:03:00Z", shipping_address: { ...fixture("order-paid-mapped").shipping_address, address1: "34 New Street" },
  });
  await processOrdersUpdated(record.id);
  const address = await prisma.orderAddress.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(address.line1, "34 New Street");
  assert.equal(address.validationStatus, "UNVERIFIED");
  assert.equal(await prisma.orderAddress.count({ where: { orderId: order.id } }), 1);
  assert.equal(await prisma.exceptionCase.count({ where: { orderId: order.id } }), 0);
});
test("any existing shipment preserves the old address and opens one ADDRESS_CHANGED_AFTER_SHIP", async () => {
  const initial = await delivery(ctx);
  await processOrdersCreate(initial.id);
  const order = await prisma.order.findFirstOrThrow({ where: { storeId: ctx.storeId }, include: { shippingAddress: true } });
  const facility = await prisma.facility.create({ data: { name: "M3 test", code: crypto.randomUUID(), countryCode: "US" } });
  const fulfillment = await prisma.fulfillment.create({ data: { orderId: order.id, facilityId: facility.id, status: "READY_TO_SHIP" } });
  const shipment = await prisma.shipment.create({ data: { fulfillmentId: fulfillment.id, provider: "manual", addressSnapshot: { line1: "12 Test Street" } } });
  try {
    for (const updated_at of ["2026-09-14T08:03:00Z", "2026-09-14T08:04:00Z"]) {
      const record = await delivery(ctx, "order-paid-mapped", "orders/updated", {
        updated_at, shipping_address: { ...fixture("order-paid-mapped").shipping_address, address1: "34 New Street" },
      });
      await processOrdersUpdated(record.id);
    }
    assert.deepEqual(await prisma.orderAddress.findUniqueOrThrow({ where: { orderId: order.id } }), order.shippingAddress);
    assert.deepEqual((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).addressSnapshot, { line1: "12 Test Street" });
    const exceptions = await prisma.exceptionCase.findMany({ where: { orderId: order.id } });
    assert.equal(exceptions.length, 1);
    assert.equal(exceptions[0].code, "ADDRESS_CHANGED_AFTER_SHIP");
    assert.equal(exceptions[0].visibility, "MERCHANT");
  } finally {
    await prisma.shipment.delete({ where: { id: shipment.id } });
    await prisma.fulfillment.delete({ where: { id: fulfillment.id } });
    await prisma.facility.delete({ where: { id: facility.id } });
  }
});
test("equal and older updated_at leave the entire canonical order unchanged", async () => {
  const initial = await delivery(ctx);
  await processOrdersCreate(initial.id);
  const before = await prisma.order.findFirstOrThrow({ where: { storeId: ctx.storeId }, include: { items: true, shippingAddress: true } });
  for (const updated_at of ["2026-09-14T08:00:00Z", "2026-09-14T08:01:00Z"]) {
    const record = await delivery(ctx, "order-paid-mapped", "orders/updated", {
      updated_at, financial_status: "refunded", shipping_address: { ...fixture("order-paid-mapped").shipping_address, address1: "Changed" },
    });
    await processOrdersUpdated(record.id);
    assert.deepEqual(await prisma.order.findUniqueOrThrow({ where: { id: before.id }, include: { items: true, shippingAddress: true } }), before);
    assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } })).status, "DUPLICATE");
  }
});
test("HELD create followed by concurrent paid updates creates exactly one order", async () => {
  const held = await delivery(ctx, "order-unpaid");
  await processOrdersCreate(held.id);
  const a = await delivery(ctx, "order-paid-mapped", "orders/updated", { updated_at: "2026-09-14T08:02:00Z" });
  const b = await delivery(ctx, "order-paid-mapped", "orders/updated", { updated_at: "2026-09-14T08:02:00Z" });
  await Promise.all([processOrdersUpdated(a.id), processOrdersUpdated(b.id)]);
  assert.equal(await prisma.order.count({ where: { storeId: ctx.storeId } }), 1);
  const old = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: held.id } });
  assert.equal(old.status, "ACCEPTED");
  assert.ok(old.resultOrderId);
});
