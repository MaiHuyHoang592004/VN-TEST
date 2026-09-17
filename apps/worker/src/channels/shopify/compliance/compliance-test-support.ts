import { prisma } from "@fulfillflow/db";
import { encryptToken } from "@fulfillflow/core";

// Matches every other .env.local's SHOPIFY_TOKEN_ENC_KEY (see shipment-sync-test-support.ts).
export const TEST_TOKEN_ENC_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

export async function setupComplianceContext(label: string) {
  const slug = `m6-compliance-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: {
    organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com`, status: "ACTIVE",
    accessTokenEnc: new Uint8Array(encryptToken("shpat_fake", TEST_TOKEN_ENC_KEY)),
    refreshTokenEnc: new Uint8Array(encryptToken("shpat_fake_refresh", TEST_TOKEN_ENC_KEY)),
    accessTokenExpiresAt: new Date(Date.now() + 3600_000),
  } });
  return { organizationId: org.id, storeId: store.id, slug };
}
export type ComplianceContext = Awaited<ReturnType<typeof setupComplianceContext>>;

export async function ingestionRecord(ctx: ComplianceContext, topic: string, rawPayload: unknown) {
  return prisma.ingestionRecord.create({ data: {
    organizationId: ctx.organizationId, storeId: ctx.storeId, source: "SHOPIFY_WEBHOOK", topic,
    dedupeKey: crypto.randomUUID(), rawPayload: rawPayload as never,
  } });
}

export async function createOrder(ctx: ComplianceContext, externalId: string, address: Partial<{
  name: string; email: string; phone: string; line1: string; city: string; province: string; postalCode: string; countryCode: string;
}> = {}) {
  return prisma.order.create({
    data: {
      organizationId: ctx.organizationId, storeId: ctx.storeId, externalId,
      sourceKey: `shopify:${ctx.storeId}:${externalId}`, currency: "USD", placedAt: new Date(),
      customerName: "Jane Buyer", customerEmail: "jane@example.com",
      shippingAddress: { create: {
        name: "Jane Buyer", email: "jane@example.com", phone: "+15551234567",
        line1: "1 Market St", city: "SF", province: "CA", postalCode: "94105", countryCode: "US",
        ...address,
      } },
    },
    include: { shippingAddress: true },
  });
}

export async function createShipmentForOrder(ctx: ComplianceContext, orderId: string) {
  const facility = await prisma.facility.create({ data: { code: `${ctx.slug}-fac`, name: `${ctx.slug}-fac`, countryCode: "US" } });
  const fulfillment = await prisma.fulfillment.create({ data: { orderId, facilityId: facility.id, status: "READY_TO_SHIP" } });
  const shipment = await prisma.shipment.create({ data: { fulfillmentId: fulfillment.id, provider: "manual", status: "IN_TRANSIT" } });
  return { facility, fulfillment, shipment };
}

export async function cleanupComplianceContext(ctx: ComplianceContext) {
  const orders = await prisma.order.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const shipments = await prisma.shipment.findMany({ where: { fulfillment: { order: { organizationId: ctx.organizationId } } }, select: { id: true } });
  await prisma.deliveryAttempt.deleteMany({ where: { outboxEvent: { aggregateId: { in: shipments.map((s) => s.id) } } } });
  await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: ctx.storeId }, { aggregateId: { in: shipments.map((s) => s.id) } }] } });
  await prisma.shipmentItem.deleteMany({ where: { shipmentId: { in: shipments.map((s) => s.id) } } });
  await prisma.shipment.deleteMany({ where: { id: { in: shipments.map((s) => s.id) } } });
  await prisma.fulfillmentItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.fulfillment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.order.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.ingestionRecord.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.facility.deleteMany({ where: { code: `${ctx.slug}-fac` } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}
