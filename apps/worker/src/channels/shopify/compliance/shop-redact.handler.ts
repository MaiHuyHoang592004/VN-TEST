/**
 * `shop/redact`: Shopify's 48-hour-after-uninstall (or merchant-requested)
 * purge. Two retention actions, both scoped to this store: drop every raw
 * webhook payload this store ever delivered (normalized operational data —
 * Order/OrderItem/Fulfillment/Shipment rows — is kept; only the freeform
 * captured JSON goes), and anonymize the PII fields on every Order/
 * OrderAddress for this store. See docs/security/data-handling.md for the
 * retention policy this implements. Idempotent: already-purged rows and
 * already-nulled fields are simply matched again with no effect.
 */
import { prisma, Prisma } from "@fulfillflow/db";

const REDACTED_ADDRESS_FIELDS = {
  name: null, company: null, email: null, phone: null,
  line1: null, line2: null, city: null, province: null, postalCode: null,
};

export async function processShopRedact(recordId: string): Promise<void> {
  const record = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: recordId } });
  const store = await prisma.store.findUniqueOrThrow({ where: { id: record.storeId } });

  await prisma.$transaction(async (tx) => {
    const purged = await tx.ingestionRecord.updateMany({
      where: { storeId: store.id, purgedAt: null },
      data: { rawPayload: Prisma.DbNull, purgedAt: new Date() },
    });

    const orders = await tx.order.findMany({ where: { storeId: store.id }, select: { id: true } });
    const anonymizedOrders = await tx.order.updateMany({
      where: { storeId: store.id },
      data: { customerName: null, customerEmail: null },
    });
    const anonymizedAddresses = orders.length > 0
      ? await tx.orderAddress.updateMany({ where: { orderId: { in: orders.map((o) => o.id) } }, data: REDACTED_ADDRESS_FIELDS })
      : { count: 0 };

    await tx.auditLog.create({ data: {
      organizationId: store.organizationId, action: "store.shop_redact",
      entityType: "Store", entityId: store.id,
      after: { ingestionRecordsPurged: purged.count, ordersAnonymized: anonymizedOrders.count, addressesAnonymized: anonymizedAddresses.count },
    } });
  });
}
