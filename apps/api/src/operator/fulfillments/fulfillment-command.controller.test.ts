import "reflect-metadata";
import { test, before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma, Prisma } from "@fulfillflow/db";
import { AppModule } from "../../app.module.js";

const apiKey = process.env.OPERATOR_API_KEY!;
let app: INestApplication;

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});
after(async () => { await app.close(); await prisma.$disconnect(); });

let organizationId: string;
let storeId: string;
let productId: string;
let facilityId: string;
let skuId: string;
let orderId: string;
let componentItemId: string;
let bomComponentId: string;

beforeEach(async () => {
  const slug = `m4-operator-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  organizationId = org.id;
  const store = await prisma.store.create({ data: { organizationId, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  storeId = store.id;
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  productId = product.id;
  const facility = await prisma.facility.create({ data: { code: slug, name: slug, countryCode: "US" } });
  facilityId = facility.id;
  const item = await prisma.inventoryItem.create({ data: { code: slug, name: slug, kind: "FINISHED_GOOD" } });
  skuId = item.id;
  await prisma.sku.create({ data: { id: item.id, productId, supplyMode: "FROM_STOCK" } });
  await prisma.inventoryBalance.create({ data: { facilityId, inventoryItemId: skuId, onHand: new Prisma.Decimal(10) } });
  const revision = await prisma.bomRevision.create({ data: { skuId, version: 1, status: "ACTIVE" } });
  const componentItem = await prisma.inventoryItem.create({ data: { code: `${slug}-raw`, name: "raw", kind: "RAW_MATERIAL" } });
  componentItemId = componentItem.id;
  await prisma.inventoryBalance.create({ data: { facilityId, inventoryItemId: componentItemId, onHand: new Prisma.Decimal(100) } });
  const component = await prisma.bomComponent.create({ data: { bomRevisionId: revision.id, inventoryItemId: componentItemId, quantityPerUnit: new Prisma.Decimal(1) } });
  bomComponentId = component.id;
  const order = await prisma.order.create({ data: {
    organizationId, storeId, externalId: crypto.randomUUID(), sourceKey: `test:${crypto.randomUUID()}`,
    currency: "USD", placedAt: new Date(), items: { create: [{ skuId, title: "item", quantity: 2 }] },
  }, include: { items: true } });
  orderId = order.id;
});
afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  const fulfillments = await prisma.fulfillment.findMany({ where: { orderId }, select: { id: true } });
  const fulfillmentIds = fulfillments.map((f) => f.id);
  await prisma.inventoryMovement.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.inventoryReservation.deleteMany({ where: { fulfillmentItem: { fulfillmentId: { in: fulfillmentIds } } } });
  await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.fulfillment.deleteMany({ where: { id: { in: fulfillmentIds } } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.inventoryBalance.deleteMany({ where: { facilityId } });
  await prisma.bomComponent.deleteMany({ where: { bomRevision: { skuId } } });
  await prisma.bomRevision.deleteMany({ where: { skuId } });
  await prisma.sku.deleteMany({ where: { id: skuId } });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: [skuId, componentItemId] } } });
  await prisma.facility.deleteMany({ where: { id: facilityId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.store.deleteMany({ where: { id: storeId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
});

async function createFulfillment(status: "QUEUED" | "IN_PRODUCTION" = "QUEUED") {
  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });
  const fulfillment = await prisma.fulfillment.create({ data: { orderId, facilityId, status } });
  const item = await prisma.fulfillmentItem.create({ data: { fulfillmentId: fulfillment.id, orderId, orderItemId: orderItem.id, quantity: orderItem.quantity } });
  return { fulfillment, fulfillmentItemId: item.id };
}
async function reserve(fulfillmentItemId: string, quantity: number) {
  return prisma.inventoryReservation.create({ data: { fulfillmentItemId, facilityId, inventoryItemId: skuId, quantity: new Prisma.Decimal(quantity) } });
}
async function reserveComponent(fulfillmentItemId: string, quantity: number) {
  await prisma.inventoryBalance.updateMany({ where: { facilityId, inventoryItemId: componentItemId }, data: { reserved: { increment: quantity } } });
  return prisma.inventoryReservation.create({ data: {
    fulfillmentItemId, facilityId, inventoryItemId: componentItemId, bomComponentId, quantity: new Prisma.Decimal(quantity),
  } });
}

test("rejects a missing operator API key with 401", async () => {
  const { fulfillment } = await createFulfillment();
  await request(app.getHttpServer()).post(`/operator/fulfillments/${fulfillment.id}/start`).expect(401);
});
test("rejects an incorrect operator API key with 401", async () => {
  const { fulfillment } = await createFulfillment();
  await request(app.getHttpServer()).post(`/operator/fulfillments/${fulfillment.id}/start`).set("X-Operator-Api-Key", "wrong").expect(401);
});

test("start moves a QUEUED fulfillment with an active reservation to IN_PRODUCTION and writes an AuditLog", async () => {
  const { fulfillment, fulfillmentItemId } = await createFulfillment("QUEUED");
  await reserve(fulfillmentItemId, 2);

  const res = await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/start`)
    .set("X-Operator-Api-Key", apiKey).set("X-Correlation-Id", "test-correlation-start").expect(200);

  assert.equal(res.body.status, "IN_PRODUCTION");
  assert.ok(res.body.productionStartedAt);
  assert.equal(res.headers["x-correlation-id"], "test-correlation-start");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: fulfillment.id, action: "fulfillment.start" } });
  assert.equal(audit.entityType, "Fulfillment");
  assert.deepEqual(audit.before, { status: "QUEUED" });
  assert.deepEqual(audit.after, { status: "IN_PRODUCTION" });
  assert.equal(audit.correlationId, "test-correlation-start");
});

test("start rejects a fulfillment with no active reservation and mutates nothing", async () => {
  const { fulfillment } = await createFulfillment("QUEUED");
  await request(app.getHttpServer()).post(`/operator/fulfillments/${fulfillment.id}/start`).set("X-Operator-Api-Key", apiKey).expect(409);
  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "QUEUED");
});

test("start rejects a fulfillment that is not QUEUED", async () => {
  const { fulfillment, fulfillmentItemId } = await createFulfillment("IN_PRODUCTION");
  await reserve(fulfillmentItemId, 2);
  await request(app.getHttpServer()).post(`/operator/fulfillments/${fulfillment.id}/start`).set("X-Operator-Api-Key", apiKey).expect(409);
});

test("complete-production consumes MTO component reservations, sets producedQuantity, and moves to READY_TO_SHIP", async () => {
  const { fulfillment, fulfillmentItemId } = await createFulfillment("IN_PRODUCTION");
  const reservation = await reserveComponent(fulfillmentItemId, 2);

  const res = await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/complete-production`).set("X-Operator-Api-Key", apiKey).expect(200);

  assert.equal(res.body.status, "READY_TO_SHIP");
  assert.ok(res.body.productionCompletedAt);
  const item = await prisma.fulfillmentItem.findUniqueOrThrow({ where: { id: fulfillmentItemId } });
  assert.equal(item.producedQuantity, 2);
  assert.equal((await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status, "CONSUMED");
  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId, inventoryItemId: componentItemId } });
  assert.equal(balance.onHand.toString(), "98");
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: fulfillment.id, action: "fulfillment.complete-production" } });
  assert.deepEqual(audit.after, { status: "READY_TO_SHIP" });
});

test("complete-production rejects a fulfillment that is not IN_PRODUCTION", async () => {
  const { fulfillment } = await createFulfillment("QUEUED");
  await request(app.getHttpServer()).post(`/operator/fulfillments/${fulfillment.id}/complete-production`).set("X-Operator-Api-Key", apiKey).expect(409);
});
