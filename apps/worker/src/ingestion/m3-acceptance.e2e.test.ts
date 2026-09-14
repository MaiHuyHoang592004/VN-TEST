import "reflect-metadata";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { prisma } from "@fulfillflow/db";
import { WorkerModule, INGESTION_LOOP } from "../worker.module.js";
import { IngestionLoop } from "./ingestion-loop.js";
import { setupOrders, cleanupOrders, delivery } from "../channels/shopify/orders/order-test-support.js";

after(async () => { await prisma.$disconnect(); });
test("M3 worker gate: paid mapped, SKU exception, HELD recovery, stale update and cancellation", async () => {
  const module = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
  const loop = module.get<IngestionLoop>(INGESTION_LOOP);
  const ctx = await setupOrders();
  try {
    const paid = await delivery(ctx);
    await loop.tick();
    assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: paid.id } })).status, "ACCEPTED");
    const unknown = await delivery(ctx, "order-paid-unmapped", "orders/create", { id: 1002, admin_graphql_api_id: "gid://shopify/Order/1002" });
    await loop.tick();
    assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: unknown.id } })).status, "EXCEPTION");
    assert.equal(await prisma.exceptionCase.count({ where: { ingestionRecordId: unknown.id, code: "SKU_NOT_MAPPED", visibility: "MERCHANT" } }), 1);
    const held = await delivery(ctx, "order-unpaid", "orders/create", { id: 1003, admin_graphql_api_id: "gid://shopify/Order/1003" });
    await loop.tick();
    assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: held.id } })).status, "HELD");
    const update = await delivery(ctx, "order-paid-mapped", "orders/updated", { id: 1003, admin_graphql_api_id: "gid://shopify/Order/1003", updated_at: "2026-09-14T08:03:00Z" });
    await loop.tick();
    const accepted = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: update.id } });
    assert.equal(accepted.status, "ACCEPTED");
    assert.ok(accepted.resultOrderId);
    const stale = await delivery(ctx, "order-unpaid", "orders/updated", { id: 1003, admin_graphql_api_id: "gid://shopify/Order/1003" });
    await loop.tick();
    assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: stale.id } })).status, "DUPLICATE");
    const cancel = await delivery(ctx, "order-paid-mapped", "orders/cancelled", { id: 1003, admin_graphql_api_id: "gid://shopify/Order/1003", updated_at: "2026-09-14T08:04:00Z" });
    await loop.tick();
    assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: cancel.id } })).status, "ACCEPTED");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: accepted.resultOrderId } })).status, "CANCELLED");
    assert.equal(await prisma.order.count({ where: { storeId: ctx.storeId } }), 2);
  } finally { await cleanupOrders(ctx); await module.close(); }
});
