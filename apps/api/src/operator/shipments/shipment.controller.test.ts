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
let orderItemId: string;

const VALID_ADDRESS = { name: "Ada Lovelace", line1: "1 Test St", city: "Metropolis", postalCode: "10001", countryCode: "US" };

beforeEach(async () => {
  const slug = `m4-ship-${crypto.randomUUID()}`;
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
  await prisma.inventoryBalance.create({ data: { facilityId, inventoryItemId: skuId, onHand: new Prisma.Decimal(10), reserved: new Prisma.Decimal(4) } });
  const order = await prisma.order.create({ data: {
    organizationId, storeId, externalId: crypto.randomUUID(), sourceKey: `test:${crypto.randomUUID()}`,
    currency: "USD", placedAt: new Date(), items: { create: [{ skuId, title: "item", quantity: 4 }] },
  }, include: { items: true } });
  orderId = order.id;
  orderItemId = order.items[0].id;
});
afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.outboxEvent.deleteMany({ where: { organizationId } });
  const fulfillments = await prisma.fulfillment.findMany({ where: { orderId }, select: { id: true } });
  const fulfillmentIds = fulfillments.map((f) => f.id);
  await prisma.shipmentItem.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.shipment.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.inventoryMovement.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.inventoryReservation.deleteMany({ where: { fulfillmentItem: { fulfillmentId: { in: fulfillmentIds } } } });
  await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.fulfillment.deleteMany({ where: { id: { in: fulfillmentIds } } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.inventoryBalance.deleteMany({ where: { facilityId } });
  await prisma.sku.deleteMany({ where: { id: skuId } });
  await prisma.inventoryItem.deleteMany({ where: { id: skuId } });
  await prisma.facility.deleteMany({ where: { id: facilityId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.store.deleteMany({ where: { id: storeId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
});

async function createShippableFulfillment(addressStatus: "VALID" | "INVALID" | "UNVERIFIED" | "none" = "VALID") {
  if (addressStatus !== "none") {
    await prisma.orderAddress.upsert({
      where: { orderId }, create: { orderId, ...VALID_ADDRESS, validationStatus: addressStatus }, update: { validationStatus: addressStatus },
    });
  }
  const fulfillment = await prisma.fulfillment.create({ data: { orderId, facilityId, status: "READY_TO_SHIP" } });
  const item = await prisma.fulfillmentItem.create({ data: { fulfillmentId: fulfillment.id, orderId, orderItemId, quantity: 4 } });
  await prisma.inventoryReservation.create({ data: { fulfillmentItemId: item.id, facilityId, inventoryItemId: skuId, quantity: new Prisma.Decimal(4) } });
  return { fulfillment, fulfillmentItemId: item.id };
}
function shipBody(fulfillmentItemId: string, quantity: number, trackingNumber = crypto.randomUUID()) {
  return { items: [{ fulfillmentItemId, quantity }], carrier: "ups", trackingNumber };
}

test("rejects shipping when there is no shipping address", async () => {
  const { fulfillment, fulfillmentItemId } = await createShippableFulfillment("none");
  await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(fulfillmentItemId, 4)).expect(409);
  assert.equal(await prisma.shipment.count({ where: { fulfillmentId: fulfillment.id } }), 0);
});
test("rejects shipping an INVALID address", async () => {
  const { fulfillment, fulfillmentItemId } = await createShippableFulfillment("INVALID");
  await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(fulfillmentItemId, 4)).expect(409);
});
test("rejects shipping an UNVERIFIED address", async () => {
  const { fulfillment, fulfillmentItemId } = await createShippableFulfillment("UNVERIFIED");
  await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(fulfillmentItemId, 4)).expect(409);
});

test("full shipment moves the Fulfillment to SHIPPED, consumes reservation, and emits one PENDING outbox plan event", async () => {
  const { fulfillment, fulfillmentItemId } = await createShippableFulfillment("VALID");
  const tracking = crypto.randomUUID();

  const res = await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(fulfillmentItemId, 4, tracking)).expect(200);

  assert.equal(res.body.status, "IN_TRANSIT");
  assert.equal(res.body.provider, "ups");
  assert.equal(res.body.trackingNumber, tracking);
  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "SHIPPED");
  const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { fulfillmentItemId } });
  assert.equal(reservation.status, "CONSUMED");
  assert.equal(reservation.consumedQuantity.toString(), "4");
  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId, inventoryItemId: skuId } });
  assert.equal(balance.onHand.toString(), "6");
  assert.equal(balance.reserved.toString(), "0");
  const events = await prisma.outboxEvent.findMany({ where: { aggregateType: "Shipment", aggregateId: res.body.id } });
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "PENDING");
  assert.equal(events[0].handler, "shopify.fulfillment.plan");
  assert.equal(events[0].eventKey, `shipment.sync-plan:${res.body.id}`);
  assert.deepEqual(events[0].payload, { shipmentId: res.body.id });
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: res.body.id, action: "fulfillment.ship" } });
  assert.equal(audit.entityType, "Shipment");
});

test("a partial shipment leaves the Fulfillment PARTIALLY_SHIPPED; the second shipment for the remainder completes it", async () => {
  const { fulfillment, fulfillmentItemId } = await createShippableFulfillment("VALID");

  const first = await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(fulfillmentItemId, 3)).expect(200);
  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "PARTIALLY_SHIPPED");
  assert.equal((await prisma.inventoryReservation.findFirstOrThrow({ where: { fulfillmentItemId } })).status, "ACTIVE");

  const second = await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(fulfillmentItemId, 1)).expect(200);
  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "SHIPPED");
  assert.equal((await prisma.inventoryReservation.findFirstOrThrow({ where: { fulfillmentItemId } })).status, "CONSUMED");
  assert.notEqual(first.body.id, second.body.id);
  assert.equal(await prisma.outboxEvent.count({ where: { aggregateType: "Shipment", aggregateId: { in: [first.body.id, second.body.id] } } }), 2);
});

test("rejects a shipment that would exceed the fulfillment item's ordered quantity", async () => {
  const { fulfillment, fulfillmentItemId } = await createShippableFulfillment("VALID");
  await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(fulfillmentItemId, 5)).expect(409);
  assert.equal(await prisma.shipment.count({ where: { fulfillmentId: fulfillment.id } }), 0);
});

test("a duplicate (carrier, trackingNumber) is rejected cleanly with no partial writes", async () => {
  const { fulfillment, fulfillmentItemId } = await createShippableFulfillment("VALID");
  const tracking = crypto.randomUUID();
  await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(fulfillmentItemId, 2, tracking)).expect(200);

  const second = await createShippableFulfillment("VALID");
  const before = await prisma.outboxEvent.count({ where: { organizationId } });
  await request(app.getHttpServer())
    .post(`/operator/fulfillments/${second.fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(second.fulfillmentItemId, 1, tracking)).expect(409);
  assert.equal(await prisma.shipment.count({ where: { fulfillmentId: second.fulfillment.id } }), 0);
  assert.equal(await prisma.outboxEvent.count({ where: { organizationId } }), before);
  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: second.fulfillment.id } })).status, "READY_TO_SHIP");
});

test("rejects an unknown fulfillmentItemId", async () => {
  const { fulfillment } = await createShippableFulfillment("VALID");
  await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(crypto.randomUUID(), 1)).expect(409);
});

test("rejects shipping a fulfillment that is not READY_TO_SHIP or PARTIALLY_SHIPPED", async () => {
  await prisma.orderAddress.create({ data: { orderId, ...VALID_ADDRESS, validationStatus: "VALID" } });
  const fulfillment = await prisma.fulfillment.create({ data: { orderId, facilityId, status: "QUEUED" } });
  const item = await prisma.fulfillmentItem.create({ data: { fulfillmentId: fulfillment.id, orderId, orderItemId, quantity: 4 } });
  await request(app.getHttpServer())
    .post(`/operator/fulfillments/${fulfillment.id}/ship`).set("X-Operator-Api-Key", apiKey)
    .send(shipBody(item.id, 4)).expect(409);
});
