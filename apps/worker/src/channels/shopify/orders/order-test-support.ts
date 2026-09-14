import { readFileSync } from "node:fs";
import { prisma } from "@fulfillflow/db";

export function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../../../../test/fixtures/shopify/${name}.json`, import.meta.url), "utf8"));
}
export async function setupOrders() {
  const slug = `m3-orders-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  const skuIds: string[] = [];
  for (const variant of [3001, 3002]) {
    const item = await prisma.inventoryItem.create({ data: { code: `${slug}-${variant}`, name: slug, kind: "FINISHED_GOOD" } });
    skuIds.push(item.id);
    await prisma.sku.create({ data: { id: item.id, productId: product.id } });
    await prisma.storeSkuMapping.create({ data: { storeId: store.id, skuId: item.id, externalVariantId: `gid://shopify/ProductVariant/${variant}` } });
  }
  return { organizationId: org.id, storeId: store.id, productId: product.id, skuIds };
}
export type OrderTestContext = Awaited<ReturnType<typeof setupOrders>>;
export async function delivery(ctx: OrderTestContext, name = "order-paid-mapped", topic = "orders/create", overrides = {}) {
  const raw = { ...fixture(name), ...overrides };
  return prisma.ingestionRecord.create({ data: {
    organizationId: ctx.organizationId, storeId: ctx.storeId, source: "SHOPIFY_WEBHOOK", topic,
    dedupeKey: crypto.randomUUID(), rawPayload: raw,
  } });
}
export async function cleanupOrders(ctx: OrderTestContext) {
  const orders = await prisma.order.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.inventoryReservation.deleteMany({ where: { fulfillmentItem: { fulfillmentId: { in: (await prisma.fulfillment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })).map((f) => f.id) } } } });
  await prisma.fulfillmentItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.fulfillment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.routingDecision.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.ingestionRecord.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.sku.deleteMany({ where: { id: { in: ctx.skuIds } } });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: ctx.skuIds } } });
  await prisma.product.delete({ where: { id: ctx.productId } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}
