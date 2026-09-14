import { prisma, type ClaimedOutbox } from "@fulfillflow/db";
import { encryptToken } from "@fulfillflow/core";

// Must match apps/worker/.env.local's SHOPIFY_TOKEN_ENC_KEY exactly — that's
// the real key the module-level shopifyTokenManager singleton decrypts with.
export const TEST_TOKEN_ENC_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

export async function setupShipmentContext(label: string, opts: { quantity?: number } = {}) {
  const slug = `m5-plan-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const quantity = opts.quantity ?? 2;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: {
    organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com`, status: "ACTIVE",
    accessTokenEnc: new Uint8Array(encryptToken("shpat_fake", TEST_TOKEN_ENC_KEY)),
  } });
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  const item = await prisma.inventoryItem.create({ data: { code: slug, name: slug, kind: "FINISHED_GOOD" } });
  await prisma.sku.create({ data: { id: item.id, productId: product.id } });
  const facility = await prisma.facility.create({ data: { code: slug, name: slug, countryCode: "US" } });
  const order = await prisma.order.create({
    data: {
      organizationId: org.id, storeId: store.id, externalId: `gid://shopify/Order/${slug}`,
      sourceKey: `shopify:${store.id}:${slug}`, currency: "USD", placedAt: new Date(),
      items: { create: [{ skuId: item.id, externalLineId: `gid://shopify/LineItem/${slug}-1`, title: "Test item", quantity }] },
    },
    include: { items: true },
  });
  const orderItem = order.items[0];
  const fulfillment = await prisma.fulfillment.create({ data: { orderId: order.id, facilityId: facility.id, status: "READY_TO_SHIP" } });
  const fulfillmentItem = await prisma.fulfillmentItem.create({ data: { fulfillmentId: fulfillment.id, orderId: order.id, orderItemId: orderItem.id, quantity } });
  const shipment = await prisma.shipment.create({ data: { fulfillmentId: fulfillment.id, provider: "manual", status: "IN_TRANSIT" } });
  const shipmentItem = await prisma.shipmentItem.create({ data: { shipmentId: shipment.id, fulfillmentId: fulfillment.id, fulfillmentItemId: fulfillmentItem.id, quantity } });
  return { organizationId: org.id, storeId: store.id, productId: product.id, skuId: item.id, facilityId: facility.id, order, orderItem, fulfillment, fulfillmentItem, shipment, shipmentItem };
}
export type ShipmentContext = Awaited<ReturnType<typeof setupShipmentContext>>;

export async function cacheFulfillmentOrderLine(ctx: ShipmentContext, opts: {
  assignedLocationId?: string | null; remainingQuantity?: number; fulfillmentOrderId?: string; fulfillmentOrderLineItemId?: string;
} = {}) {
  return prisma.shopifyFulfillmentOrderLine.create({ data: {
    orderItemId: ctx.orderItem.id,
    fulfillmentOrderId: opts.fulfillmentOrderId ?? `gid://shopify/FulfillmentOrder/${ctx.orderItem.id}`,
    fulfillmentOrderLineItemId: opts.fulfillmentOrderLineItemId ?? `gid://shopify/FulfillmentOrderLineItem/${ctx.orderItem.id}`,
    remainingQuantity: opts.remainingQuantity ?? ctx.shipmentItem.quantity,
    assignedLocationId: opts.assignedLocationId === undefined ? "gid://shopify/Location/1" : opts.assignedLocationId,
    resolvedAt: new Date(),
  } });
}

/** Creates a real PENDING plan-shaped OutboxEvent row and returns it as a ClaimedOutbox — handlers are called directly in tests, bypassing OutboxLoop.tick(). */
export async function makePlanEvent(ctx: ShipmentContext): Promise<ClaimedOutbox> {
  const row = await prisma.outboxEvent.create({ data: {
    organizationId: ctx.organizationId, eventKey: `shipment.sync-plan:${ctx.shipment.id}`,
    aggregateType: "Shipment", aggregateId: ctx.shipment.id, handler: "shopify.fulfillment.plan",
    payload: { shipmentId: ctx.shipment.id },
  } });
  return { id: row.id, handler: row.handler, payload: row.payload, attempts: row.attempts, aggregateType: row.aggregateType, aggregateId: row.aggregateId };
}

/** Creates a real PENDING create-shaped OutboxEvent row and returns it as a ClaimedOutbox. */
export async function makeCreateEvent(ctx: ShipmentContext, opts: {
  assignedLocationId?: string; allocations?: Array<{ fulfillmentOrderId: string; fulfillmentOrderLineItemId: string; quantity: number }>;
} = {}) {
  const assignedLocationId = opts.assignedLocationId ?? "gid://shopify/Location/1";
  const allocations = opts.allocations ?? [{
    fulfillmentOrderId: `gid://shopify/FulfillmentOrder/${ctx.orderItem.id}`,
    fulfillmentOrderLineItemId: `gid://shopify/FulfillmentOrderLineItem/${ctx.orderItem.id}`,
    quantity: ctx.shipmentItem.quantity,
  }];
  const row = await prisma.outboxEvent.create({ data: {
    organizationId: ctx.organizationId, eventKey: `shipment.sync:${ctx.shipment.id}:${assignedLocationId}`,
    aggregateType: "Shipment", aggregateId: ctx.shipment.id, handler: "shopify.fulfillment.create",
    payload: { shipmentId: ctx.shipment.id, assignedLocationId, allocations },
  } });
  return { id: row.id, handler: row.handler, payload: row.payload, attempts: row.attempts, aggregateType: row.aggregateType, aggregateId: row.aggregateId };
}

export async function cleanupShipmentContext(ctx: ShipmentContext) {
  await prisma.deliveryAttempt.deleteMany({ where: { outboxEvent: { aggregateId: ctx.shipment.id } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: ctx.shipment.id } });
  await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.shopifyFulfillmentOrderLine.deleteMany({ where: { orderItemId: ctx.orderItem.id } });
  await prisma.shipmentItem.deleteMany({ where: { shipmentId: ctx.shipment.id } });
  await prisma.shipment.delete({ where: { id: ctx.shipment.id } });
  await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentId: ctx.fulfillment.id } });
  await prisma.fulfillment.delete({ where: { id: ctx.fulfillment.id } });
  await prisma.orderItem.deleteMany({ where: { orderId: ctx.order.id } });
  await prisma.order.delete({ where: { id: ctx.order.id } });
  await prisma.facility.delete({ where: { id: ctx.facilityId } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.sku.deleteMany({ where: { id: ctx.skuId } });
  await prisma.inventoryItem.deleteMany({ where: { id: ctx.skuId } });
  await prisma.product.delete({ where: { id: ctx.productId } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}
