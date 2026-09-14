import { prisma } from "@fulfillflow/db";

export async function setupFulfillmentOrderContext(label: string) {
  const slug = `m5-fo-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  const item = await prisma.inventoryItem.create({ data: { code: slug, name: slug, kind: "FINISHED_GOOD" } });
  await prisma.sku.create({ data: { id: item.id, productId: product.id } });
  const order = await prisma.order.create({
    data: {
      organizationId: org.id, storeId: store.id, externalId: `gid://shopify/Order/${slug}`,
      sourceKey: `shopify:${store.id}:${slug}`, currency: "USD", placedAt: new Date(),
      items: { create: [{ skuId: item.id, externalLineId: `gid://shopify/LineItem/${slug}-1`, title: "Test item", quantity: 2 }] },
    },
    include: { items: true },
  });
  return { organizationId: org.id, storeId: store.id, productId: product.id, skuId: item.id, order };
}
export type FulfillmentOrderContext = Awaited<ReturnType<typeof setupFulfillmentOrderContext>>;

export function fakeTokenManager(accessToken = "fake-access-token") {
  return { withAccessToken: async <T>(_storeId: string, fn: (accessToken: string) => Promise<T>) => fn(accessToken) };
}

export async function cleanupFulfillmentOrderContext(ctx: FulfillmentOrderContext) {
  await prisma.shopifyFulfillmentOrderLine.deleteMany({ where: { orderItem: { orderId: ctx.order.id } } });
  await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.orderItem.deleteMany({ where: { orderId: ctx.order.id } });
  await prisma.order.delete({ where: { id: ctx.order.id } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.sku.deleteMany({ where: { id: ctx.skuId } });
  await prisma.inventoryItem.deleteMany({ where: { id: ctx.skuId } });
  await prisma.product.delete({ where: { id: ctx.productId } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}
