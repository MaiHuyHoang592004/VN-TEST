import { prisma } from "@fulfillflow/db";

export async function setupRouting() {
  const slug = `m4-routing-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  const skuIds: string[] = [];
  for (const n of [1, 2]) {
    const item = await prisma.inventoryItem.create({ data: { code: `${slug}-${n}`, name: slug, kind: "FINISHED_GOOD" } });
    skuIds.push(item.id);
    await prisma.sku.create({ data: { id: item.id, productId: product.id } });
  }
  return { organizationId: org.id, storeId: store.id, productId: product.id, skuIds };
}
export type RoutingTestContext = Awaited<ReturnType<typeof setupRouting>>;

export async function createOrder(ctx: RoutingTestContext, items: Array<{ skuId: string; quantity: number }>) {
  return prisma.order.create({
    data: {
      organizationId: ctx.organizationId, storeId: ctx.storeId,
      externalId: crypto.randomUUID(), sourceKey: `test:${crypto.randomUUID()}`,
      currency: "USD", placedAt: new Date(),
      items: { create: items.map((i) => ({ skuId: i.skuId, title: "item", quantity: i.quantity })) },
    },
    include: { items: true },
  });
}

export async function createFacility(data: {
  code?: string;
  status?: "ACTIVE" | "INACTIVE";
  capabilities?: Array<{ skuId: string; enabled?: boolean; priority?: number; leadTimeHours?: number | null }>;
}) {
  return prisma.facility.create({
    data: {
      code: data.code ?? crypto.randomUUID(), name: "routing test facility", countryCode: "US", status: data.status ?? "ACTIVE",
      capabilities: data.capabilities
        ? { create: data.capabilities.map((c) => ({ skuId: c.skuId, enabled: c.enabled ?? true, priority: c.priority ?? 0, leadTimeHours: c.leadTimeHours ?? null })) }
        : undefined,
    },
  });
}

export async function cleanupRouting(ctx: RoutingTestContext, facilityIds: string[]) {
  const orders = await prisma.order.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.fulfillmentItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.fulfillment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.routingDecision.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.facilitySkuCapability.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await prisma.facility.deleteMany({ where: { id: { in: facilityIds } } });
  await prisma.sku.deleteMany({ where: { id: { in: ctx.skuIds } } });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: ctx.skuIds } } });
  await prisma.product.delete({ where: { id: ctx.productId } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}
