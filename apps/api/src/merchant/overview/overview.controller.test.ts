import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@fulfillflow/db";
import { AppModule } from "../../app.module.js";
import { bootstrapTenant, type BootstrappedTenant } from "../merchant-test-support.js";

let app: INestApplication;
before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
});
after(async () => { await app?.close(); await prisma.$disconnect(); });

async function cleanup(t: BootstrappedTenant) {
  const orders = await prisma.order.findMany({ where: { organizationId: t.organizationId }, select: { id: true } });
  await prisma.exceptionCase.deleteMany({ where: { organizationId: t.organizationId } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await prisma.order.deleteMany({ where: { organizationId: t.organizationId } });
  await prisma.organizationMembership.deleteMany({ where: { organizationId: t.organizationId } });
  await prisma.store.deleteMany({ where: { id: t.storeId } });
  await prisma.organization.delete({ where: { id: t.organizationId } });
  await prisma.user.deleteMany({ where: { shopifyUserId: t.shopifyUserId } });
}

test("unauthenticated requests are rejected", async () => {
  const res = await request(app.getHttpServer()).get("/app/overview");
  assert.equal(res.status, 401);
});

test("defaults to a 24h window and computes real ratios from actual orders/exceptions", async () => {
  const tenant = await bootstrapTenant(app, "overview");
  const product = await prisma.product.create({ data: { name: "p", handle: `p-${crypto.randomUUID()}` } });
  const item = await prisma.inventoryItem.create({ data: { code: crypto.randomUUID(), name: "i", kind: "FINISHED_GOOD" } });
  try {
    await prisma.sku.create({ data: { id: item.id, productId: product.id } });

    const clean = await prisma.order.create({ data: {
      organizationId: tenant.organizationId, storeId: tenant.storeId, externalId: crypto.randomUUID(),
      sourceKey: `t:${crypto.randomUUID()}`, currency: "USD", placedAt: new Date(),
      items: { create: [{ skuId: item.id, title: "x", quantity: 1 }] },
    } });
    const flagged = await prisma.order.create({ data: {
      organizationId: tenant.organizationId, storeId: tenant.storeId, externalId: crypto.randomUUID(),
      sourceKey: `t:${crypto.randomUUID()}`, currency: "USD", placedAt: new Date(),
      items: { create: [{ skuId: item.id, title: "x", quantity: 1 }] },
    } });
    await prisma.exceptionCase.create({ data: {
      organizationId: tenant.organizationId, orderId: flagged.id, code: "INVALID_ADDRESS",
      visibility: "MERCHANT", status: "OPEN", subjectKey: `order:${flagged.id}`, message: "bad address",
    } });

    const res = await request(app.getHttpServer()).get("/app/overview").set("Authorization", tenant.authHeader);
    assert.equal(res.status, 200);
    assert.equal(res.body.window, "24h");
    assert.equal(res.body.ordersReceived, 2);
    assert.equal(res.body.straightThroughOrders, 1);
    assert.equal(res.body.straightThroughRate, 0.5);
    assert.equal(res.body.needsAttention, 1);
    assert.equal(res.body.manualTouchRate, 0.5);
    assert.equal(res.body.shopifySyncSuccessRate, null);
    assert.equal(typeof res.body.definitions.ordersReceived, "string");
    void clean;
  } finally {
    // cleanup(tenant) removes the Orders/OrderItems first; only then can the
    // Sku/InventoryItem/Product those OrderItems reference be dropped.
    await cleanup(tenant);
    await prisma.sku.deleteMany({ where: { id: item.id } });
    await prisma.inventoryItem.delete({ where: { id: item.id } });
    await prisma.product.delete({ where: { id: product.id } });
  }
});

test("honors ?window=7d", async () => {
  const tenant = await bootstrapTenant(app, "window");
  try {
    const res = await request(app.getHttpServer()).get("/app/overview?window=7d").set("Authorization", tenant.authHeader);
    assert.equal(res.status, 200);
    assert.equal(res.body.window, "7d");
    assert.equal(res.body.ordersReceived, 0);
    assert.equal(res.body.straightThroughRate, 0);
  } finally {
    await cleanup(tenant);
  }
});

test("one tenant's orders never appear in another tenant's overview", async () => {
  const a = await bootstrapTenant(app, "iso-a");
  const b = await bootstrapTenant(app, "iso-b");
  const product = await prisma.product.create({ data: { name: "p", handle: `p-${crypto.randomUUID()}` } });
  const item = await prisma.inventoryItem.create({ data: { code: crypto.randomUUID(), name: "i", kind: "FINISHED_GOOD" } });
  try {
    await prisma.sku.create({ data: { id: item.id, productId: product.id } });
    await prisma.order.create({ data: {
      organizationId: a.organizationId, storeId: a.storeId, externalId: crypto.randomUUID(),
      sourceKey: `t:${crypto.randomUUID()}`, currency: "USD", placedAt: new Date(),
      items: { create: [{ skuId: item.id, title: "x", quantity: 1 }] },
    } });

    const res = await request(app.getHttpServer()).get("/app/overview").set("Authorization", b.authHeader);
    assert.equal(res.body.ordersReceived, 0);
  } finally {
    await cleanup(a);
    await cleanup(b);
    await prisma.sku.deleteMany({ where: { id: item.id } });
    await prisma.inventoryItem.delete({ where: { id: item.id } });
    await prisma.product.delete({ where: { id: product.id } });
  }
});
