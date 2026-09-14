import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma, Prisma } from "@fulfillflow/db";
import { routeOrder, reserveFulfillment } from "@fulfillflow/core";
import { AppModule } from "../app.module.js";

const apiKey = process.env.OPERATOR_API_KEY!;
let app: INestApplication;
before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});
after(async () => { await app.close(); await prisma.$disconnect(); });

/**
 * Gate M4: "Using a canonical Shopify-ingested order: Order -> route ->
 * reserve -> start -> complete-production -> ship." M3's ingestion/
 * normalization is already covered by apps/worker's own acceptance test;
 * this starts from the canonical Order/OrderItem M3 ingestion would have
 * produced and drives the rest of the pipeline for real — routeOrder and
 * reserveFulfillment via @fulfillflow/core exactly as apps/worker calls
 * them, then the actual HTTP operator endpoints for the rest.
 */
test("M4 acceptance gate: route -> reserve -> start -> complete-production -> ship, no inventory drift, one outbox plan event", async () => {
  const slug = `m4-gate-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  const facility = await prisma.facility.create({ data: { code: slug, name: slug, countryCode: "US" } });
  const item = await prisma.inventoryItem.create({ data: { code: slug, name: slug, kind: "FINISHED_GOOD" } });
  await prisma.sku.create({ data: { id: item.id, productId: product.id, supplyMode: "FROM_STOCK" } });
  await prisma.facilitySkuCapability.create({ data: { facilityId: facility.id, skuId: item.id } });
  await prisma.inventoryBalance.create({ data: { facilityId: facility.id, inventoryItemId: item.id, onHand: new Prisma.Decimal(20) } });

  try {
    const order = await prisma.order.create({ data: {
      organizationId: org.id, storeId: store.id, externalId: crypto.randomUUID(), sourceKey: `test:${crypto.randomUUID()}`,
      currency: "USD", placedAt: new Date(),
      shippingAddress: { create: { name: "Ada Lovelace", line1: "1 Test St", city: "Metropolis", postalCode: "10001", countryCode: "US", validationStatus: "VALID" } },
      items: { create: [{ skuId: item.id, title: "widget", quantity: 3 }] },
    }, include: { items: true } });

    const routed = await routeOrder(order.id);
    assert.ok(routed.fulfillmentId, "expected an eligible facility to be selected");
    const decision = await prisma.routingDecision.findUniqueOrThrow({ where: { id: routed.routingDecisionId } });
    assert.equal(decision.status, "SELECTED");
    assert.equal(decision.selectedFacilityId, facility.id);

    await reserveFulfillment(routed.fulfillmentId!);
    const afterReserve = await prisma.fulfillment.findUniqueOrThrow({ where: { id: routed.fulfillmentId! } });
    assert.equal(afterReserve.status, "QUEUED", "reservation must succeed against available stock, not block the fulfillment");
    const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { fulfillmentItem: { fulfillmentId: routed.fulfillmentId! } } });
    assert.equal(reservation.status, "ACTIVE");
    let balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: facility.id, inventoryItemId: item.id } });
    assert.equal(balance.onHand.toString(), "20");
    assert.equal(balance.reserved.toString(), "3");

    await request(app.getHttpServer())
      .post(`/operator/fulfillments/${routed.fulfillmentId}/start`).set("X-Operator-Api-Key", apiKey).expect(200);
    assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: routed.fulfillmentId! } })).status, "IN_PRODUCTION");

    await request(app.getHttpServer())
      .post(`/operator/fulfillments/${routed.fulfillmentId}/complete-production`).set("X-Operator-Api-Key", apiKey).expect(200);
    assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: routed.fulfillmentId! } })).status, "READY_TO_SHIP");

    const fulfillmentItem = await prisma.fulfillmentItem.findFirstOrThrow({ where: { fulfillmentId: routed.fulfillmentId! } });
    const shipRes = await request(app.getHttpServer())
      .post(`/operator/fulfillments/${routed.fulfillmentId}/ship`).set("X-Operator-Api-Key", apiKey)
      .send({ items: [{ fulfillmentItemId: fulfillmentItem.id, quantity: 3 }], carrier: "ups", trackingNumber: crypto.randomUUID() })
      .expect(200);

    assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: routed.fulfillmentId! } })).status, "SHIPPED");
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipRes.body.id } });
    assert.equal(shipment.fulfillmentId, routed.fulfillmentId);
    assert.equal(shipment.status, "IN_TRANSIT");

    // No inventory drift: everything reserved was consumed, nothing left dangling, no negative balance.
    balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: facility.id, inventoryItemId: item.id } });
    assert.equal(balance.onHand.toString(), "17");
    assert.equal(balance.reserved.toString(), "0");
    assert.ok(balance.reserved.lte(balance.onHand));
    assert.equal((await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status, "CONSUMED");

    const outboxEvents = await prisma.outboxEvent.findMany({ where: { aggregateType: "Shipment", aggregateId: shipment.id } });
    assert.equal(outboxEvents.length, 1);
    assert.equal(outboxEvents[0].status, "PENDING");
    assert.equal(outboxEvents[0].handler, "shopify.fulfillment.plan");
    assert.equal(outboxEvents[0].eventKey, `shipment.sync-plan:${shipment.id}`);
  } finally {
    const orders = await prisma.order.findMany({ where: { organizationId: org.id }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    const fulfillments = await prisma.fulfillment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
    const fulfillmentIds = fulfillments.map((f) => f.id);
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.shipmentItem.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
    await prisma.shipment.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
    await prisma.inventoryReservation.deleteMany({ where: { fulfillmentItem: { fulfillmentId: { in: fulfillmentIds } } } });
    await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
    await prisma.fulfillment.deleteMany({ where: { id: { in: fulfillmentIds } } });
    await prisma.routingDecision.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.inventoryBalance.deleteMany({ where: { facilityId: facility.id } });
    await prisma.facilitySkuCapability.deleteMany({ where: { facilityId: facility.id } });
    await prisma.sku.deleteMany({ where: { id: item.id } });
    await prisma.inventoryItem.deleteMany({ where: { id: item.id } });
    await prisma.facility.deleteMany({ where: { id: facility.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.store.deleteMany({ where: { id: store.id } });
    await prisma.organization.deleteMany({ where: { id: org.id } });
  }
});
