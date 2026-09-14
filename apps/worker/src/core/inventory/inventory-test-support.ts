import { prisma, Prisma } from "@fulfillflow/db";

export async function setupInventory() {
  const slug = `m4-inventory-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  const facility = await prisma.facility.create({ data: { code: slug, name: slug, countryCode: "US" } });
  return { organizationId: org.id, storeId: store.id, productId: product.id, facilityId: facility.id };
}
export type InventoryTestContext = Awaited<ReturnType<typeof setupInventory>>;

export async function createFromStockSku(ctx: InventoryTestContext, onHand: number) {
  const item = await prisma.inventoryItem.create({ data: { code: crypto.randomUUID(), name: "from-stock", kind: "FINISHED_GOOD" } });
  await prisma.sku.create({ data: { id: item.id, productId: ctx.productId, supplyMode: "FROM_STOCK" } });
  await prisma.inventoryBalance.create({ data: { facilityId: ctx.facilityId, inventoryItemId: item.id, onHand: new Prisma.Decimal(onHand) } });
  return item.id;
}

export async function createMtoSku(ctx: InventoryTestContext, components: Array<{ onHand: number; quantityPerUnit: number; wastageRate?: number }>) {
  const item = await prisma.inventoryItem.create({ data: { code: crypto.randomUUID(), name: "mto", kind: "FINISHED_GOOD" } });
  await prisma.sku.create({ data: { id: item.id, productId: ctx.productId, supplyMode: "MADE_TO_ORDER" } });
  const revision = await prisma.bomRevision.create({ data: { skuId: item.id, version: 1, status: "ACTIVE" } });
  const componentItemIds: string[] = [];
  for (const c of components) {
    const componentItem = await prisma.inventoryItem.create({ data: { code: crypto.randomUUID(), name: "raw", kind: "RAW_MATERIAL" } });
    componentItemIds.push(componentItem.id);
    await prisma.inventoryBalance.create({ data: { facilityId: ctx.facilityId, inventoryItemId: componentItem.id, onHand: new Prisma.Decimal(c.onHand) } });
    await prisma.bomComponent.create({ data: {
      bomRevisionId: revision.id, inventoryItemId: componentItem.id,
      quantityPerUnit: new Prisma.Decimal(c.quantityPerUnit), wastageRate: new Prisma.Decimal(c.wastageRate ?? 0),
    } });
  }
  return { skuId: item.id, componentItemIds };
}

export async function createFulfillment(ctx: InventoryTestContext, skuId: string, quantity: number, status: "QUEUED" | "BLOCKED" = "QUEUED") {
  const order = await prisma.order.create({ data: {
    organizationId: ctx.organizationId, storeId: ctx.storeId, externalId: crypto.randomUUID(), sourceKey: `test:${crypto.randomUUID()}`,
    currency: "USD", placedAt: new Date(), items: { create: [{ skuId, title: "item", quantity }] },
  }, include: { items: true } });
  const fulfillment = await prisma.fulfillment.create({ data: { orderId: order.id, facilityId: ctx.facilityId, status } });
  const fulfillmentItem = await prisma.fulfillmentItem.create({ data: { fulfillmentId: fulfillment.id, orderId: order.id, orderItemId: order.items[0].id, quantity } });
  return { order, fulfillment, fulfillmentItemId: fulfillmentItem.id };
}

export async function cleanupInventory(ctx: InventoryTestContext, skuIds: string[]) {
  const orders = await prisma.order.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const fulfillments = await prisma.fulfillment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const fulfillmentIds = fulfillments.map((f) => f.id);
  await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.inventoryMovement.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.shipmentItem.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.shipment.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.inventoryReservation.deleteMany({ where: { fulfillmentItem: { fulfillmentId: { in: fulfillmentIds } } } });
  await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentId: { in: fulfillmentIds } } });
  await prisma.fulfillment.deleteMany({ where: { id: { in: fulfillmentIds } } });
  await prisma.routingDecision.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.inventoryBalance.deleteMany({ where: { facilityId: ctx.facilityId } });
  const components = await prisma.bomComponent.findMany({ where: { bomRevision: { skuId: { in: skuIds } } }, select: { inventoryItemId: true } });
  await prisma.bomComponent.deleteMany({ where: { bomRevision: { skuId: { in: skuIds } } } });
  await prisma.bomRevision.deleteMany({ where: { skuId: { in: skuIds } } });
  await prisma.sku.deleteMany({ where: { id: { in: skuIds } } });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: [...skuIds, ...components.map((c) => c.inventoryItemId)] } } });
  await prisma.facility.delete({ where: { id: ctx.facilityId } });
  await prisma.product.delete({ where: { id: ctx.productId } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}
