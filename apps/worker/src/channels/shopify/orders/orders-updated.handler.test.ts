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
