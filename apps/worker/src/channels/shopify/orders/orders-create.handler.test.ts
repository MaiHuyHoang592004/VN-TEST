import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { processOrdersCreate } from "./orders-create.handler.js";
import { setupOrders, cleanupOrders, delivery, type OrderTestContext } from "./order-test-support.js";

let ctx: OrderTestContext;
beforeEach(async () => { ctx = await setupOrders(); });
afterEach(async () => { if (ctx) await cleanupOrders(ctx); });
after(async () => { await prisma.$disconnect(); });
test("paid mapped order creates canonical order, address and N items and accepts atomically", async () => {
  const record = await delivery(ctx, "order-two-lines");
  await processOrdersCreate(record.id);
  const row = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
  assert.equal(row.status, "ACCEPTED");
  assert.ok(row.resultOrderId);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: row.resultOrderId }, include: { items: true, shippingAddress: true } });
  assert.equal(order.organizationId, ctx.organizationId);
  assert.equal(order.storeId, ctx.storeId);
  assert.equal(order.externalId, "gid://shopify/Order/1001");
  assert.equal(order.sourceKey, `shopify:${ctx.storeId}:gid://shopify/Order/1001`);
  assert.equal(order.items.length, 2);
  assert.deepEqual(order.items.map((i) => i.skuId).sort(), ctx.skuIds.sort());
  assert.equal(order.shippingAddress?.validationStatus, "VALID");
  assert.ok(row.normalizedPayload);
  assert.ok(row.processedAt);
});
