import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { encryptToken } from "@fulfillflow/core";
import { processFulfillmentOrderRoutingComplete } from "./fulfillment-order-routing-complete.handler.js";
import { BusinessIngestionError } from "../../../ingestion/ingestion-errors.js";

// Must match apps/worker/.env.local's SHOPIFY_TOKEN_ENC_KEY exactly — that's
// the real key the module-level shopifyTokenManager singleton decrypts with.
const TOKEN_ENC_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

const orgIds: string[] = [];
after(async () => {
  await prisma.exceptionCase.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.shopifyFulfillmentOrderLine.deleteMany({ where: { orderItem: { order: { organizationId: { in: orgIds } } } } });
  await prisma.orderItem.deleteMany({ where: { order: { organizationId: { in: orgIds } } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.ingestionRecord.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.store.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.$disconnect();
});

async function setupStoreAndOrder(label: string, opts: { withOrder?: boolean } = { withOrder: true }) {
  const slug = `m5-routing-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  orgIds.push(org.id);
  const store = await prisma.store.create({
    data: {
      organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com`, status: "ACTIVE",
      accessTokenEnc: new Uint8Array(encryptToken("shpat_fake", TOKEN_ENC_KEY)),
    },
  });
  const numericOrderId = String(Math.floor(Math.random() * 1_000_000_000));
  let orderId: string | undefined;
  if (opts.withOrder !== false) {
    const product = await prisma.product.create({ data: { name: slug, handle: slug } });
    const item = await prisma.inventoryItem.create({ data: { code: slug, name: slug, kind: "FINISHED_GOOD" } });
    await prisma.sku.create({ data: { id: item.id, productId: product.id } });
    const order = await prisma.order.create({ data: {
      organizationId: org.id, storeId: store.id, externalId: `gid://shopify/Order/${numericOrderId}`,
      sourceKey: `shopify:${store.id}:${slug}`, currency: "USD", placedAt: new Date(),
      items: { create: [{ skuId: item.id, externalLineId: `gid://shopify/LineItem/${slug}-1`, title: "Test item", quantity: 1 }] },
    } });
    orderId = order.id;
  }
  return { org, store, numericOrderId, orderId };
}

async function makeRecord(storeId: string, organizationId: string, rawPayload: unknown) {
  return prisma.ingestionRecord.create({ data: {
    organizationId, storeId, source: "SHOPIFY_WEBHOOK", topic: "fulfillment_orders/order_routing_complete",
    dedupeKey: crypto.randomUUID(), rawPayload: rawPayload as never,
  } });
}

test("an invalid payload is a business failure, not retried", async () => {
  const { store, org } = await setupStoreAndOrder("invalid", { withOrder: false });
  const record = await makeRecord(store.id, org.id, { nope: true });
  await assert.rejects(() => processFulfillmentOrderRoutingComplete(record.id), BusinessIngestionError);
});

test("no canonical Order yet for this Shopify order is retryable", async () => {
  const { store, org, numericOrderId } = await setupStoreAndOrder("missing-order", { withOrder: false });
  const record = await makeRecord(store.id, org.id, { fulfillment_order: { order_id: numericOrderId } });
  await assert.rejects(
    () => processFulfillmentOrderRoutingComplete(record.id),
    (err: unknown) => { assert.ok(!(err instanceof BusinessIngestionError)); return true; },
  );
});

test("refreshes the FulfillmentOrder cache for the matching canonical Order", async () => {
  const { store, org, numericOrderId, orderId } = await setupStoreAndOrder("happy");
  const record = await makeRecord(store.id, org.id, { fulfillment_order: { order_id: numericOrderId } });
  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true, status: 200,
    json: async () => ({
      data: { order: { fulfillmentOrders: { nodes: [{
        id: "gid://shopify/FulfillmentOrder/999",
        assignedLocation: { location: { id: "gid://shopify/Location/1", fulfillmentService: null } },
        lineItems: { nodes: [{ id: "gid://shopify/FulfillmentOrderLineItem/999", remainingQuantity: 1, lineItem: { id: orderItem.externalLineId } }] },
      }] } } },
    }),
    text: async () => "",
  })) as unknown as typeof fetch;

  try {
    await processFulfillmentOrderRoutingComplete(record.id);
  } finally {
    globalThis.fetch = realFetch;
  }

  const cached = await prisma.shopifyFulfillmentOrderLine.findUnique({ where: { fulfillmentOrderLineItemId: "gid://shopify/FulfillmentOrderLineItem/999" } });
  assert.ok(cached);
  assert.equal(cached!.orderItemId, orderItem.id);
});
