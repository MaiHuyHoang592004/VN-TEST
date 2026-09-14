import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { processOrdersCreate } from "./orders-create.handler.js";
import { setupOrders, cleanupOrders, delivery, type OrderTestContext } from "./order-test-support.js";

let ctx: OrderTestContext;
beforeEach(async () => { ctx = await setupOrders(); });
afterEach(async () => { if (ctx) await cleanupOrders(ctx); });
after(async () => { await prisma.$disconnect(); });
test("concurrent duplicate deliveries create one order and settle the other DUPLICATE", async () => {
  const a = await delivery(ctx);
  const b = await delivery(ctx);
  await Promise.all([processOrdersCreate(a.id), processOrdersCreate(b.id)]);
  const rows = await prisma.ingestionRecord.findMany({ where: { storeId: ctx.storeId } });
  assert.deepEqual(rows.map((r) => r.status).sort(), ["ACCEPTED", "DUPLICATE"]);
  assert.equal(new Set(rows.map((r) => r.resultOrderId)).size, 1);
  assert.equal(await prisma.order.count({ where: { storeId: ctx.storeId } }), 1);
});
test("another store's mapping cannot fulfill an unmapped variant", async () => {
  const other = await setupOrders();
  try {
    await prisma.storeSkuMapping.deleteMany({ where: { storeId: ctx.storeId } });
    const record = await delivery(ctx);
    await processOrdersCreate(record.id);
    assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } })).status, "EXCEPTION");
    assert.equal(await prisma.order.count({ where: { storeId: ctx.storeId } }), 0);
  } finally { await cleanupOrders(other); }
});
test("one unmapped line creates no order and exactly one merchant SKU_NOT_MAPPED", async () => {
  const record = await delivery(ctx, "order-paid-unmapped");
  await processOrdersCreate(record.id);
  const row = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
  assert.equal(row.status, "EXCEPTION");
  assert.equal(row.errorCode, "SKU_NOT_MAPPED");
  assert.equal(await prisma.order.count({ where: { storeId: ctx.storeId } }), 0);
  const exceptions = await prisma.exceptionCase.findMany({ where: { ingestionRecordId: record.id } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].subjectKey, `ingestion:${record.id}`);
  assert.equal(exceptions[0].code, "SKU_NOT_MAPPED");
  assert.equal(exceptions[0].visibility, "MERCHANT");
  await processOrdersCreate(record.id);
  assert.equal(await prisma.exceptionCase.count({ where: { ingestionRecordId: record.id } }), 1);
});
test("unpaid order is HELD with no order or SKU exception", async () => {
  const record = await delivery(ctx, "order-unpaid");
  await processOrdersCreate(record.id);
  assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } })).status, "HELD");
  assert.equal(await prisma.order.count({ where: { storeId: ctx.storeId } }), 0);
  assert.equal(await prisma.exceptionCase.count({ where: { ingestionRecordId: record.id } }), 0);
});
test("invalid address still creates an order and opens one merchant INVALID_ADDRESS", async () => {
  const record = await delivery(ctx, "order-invalid-address");
  await processOrdersCreate(record.id);
  const order = await prisma.order.findFirstOrThrow({ where: { storeId: ctx.storeId }, include: { items: true, shippingAddress: true } });
  assert.equal(order.items.length, 1);
  assert.equal(order.shippingAddress?.validationStatus, "INVALID");
  assert.equal(order.shippingAddress?.line1, null);
  assert.equal(order.shippingAddress?.countryCode, null);
  assert.equal((order.shippingAddress?.validationErrors as Record<string, string>).countryCode, "INVALID_COUNTRY_CODE");
  const exceptions = await prisma.exceptionCase.findMany({ where: { orderId: order.id, visibility: "MERCHANT" } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].code, "INVALID_ADDRESS");
  assert.equal(exceptions[0].visibility, "MERCHANT");
  assert.equal(exceptions[0].organizationId, ctx.organizationId);
  await processOrdersCreate(record.id);
  assert.equal(await prisma.exceptionCase.count({ where: { orderId: order.id, visibility: "MERCHANT" } }), 1);
});
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
