/**
 * `customers/redact`: Shopify tells us exactly which of this store's orders
 * are now past their legal retention window (`orders_to_redact`, numeric
 * Shopify order ids) — that list, not a customer-id/email match, is the
 * authoritative signal for what may be anonymized. Same field set as
 * `shop/redact`, scoped to just those orders. An empty list (a customer with
 * no orders old enough yet, or none at all) is a legitimate no-op.
 */
import { z } from "zod";
import { prisma } from "@fulfillflow/db";
import { BusinessIngestionError } from "../../../ingestion/ingestion-errors.js";

const payloadSchema = z.object({
  customer: z.object({ id: z.union([z.string(), z.number()]).transform(String) }),
  orders_to_redact: z.array(z.union([z.string(), z.number()]).transform(String)).optional().default([]),
});

const REDACTED_ADDRESS_FIELDS = {
  name: null, company: null, email: null, phone: null,
  line1: null, line2: null, city: null, province: null, postalCode: null,
};

export async function processCustomersRedact(recordId: string): Promise<void> {
  const record = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: recordId } });
  const parsed = payloadSchema.safeParse(record.rawPayload);
  if (!parsed.success) throw new BusinessIngestionError("INVALID_PAYLOAD", "Invalid customers/redact payload");
  const store = await prisma.store.findUniqueOrThrow({ where: { id: record.storeId } });

  const externalIds = parsed.data.orders_to_redact.map((id) => `gid://shopify/Order/${id}`);
  await prisma.$transaction(async (tx) => {
    const orders = externalIds.length > 0
      ? await tx.order.findMany({ where: { storeId: store.id, externalId: { in: externalIds } }, select: { id: true } })
      : [];

    const anonymizedOrders = orders.length > 0
      ? await tx.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { customerName: null, customerEmail: null } })
      : { count: 0 };
    const anonymizedAddresses = orders.length > 0
      ? await tx.orderAddress.updateMany({ where: { orderId: { in: orders.map((o) => o.id) } }, data: REDACTED_ADDRESS_FIELDS })
      : { count: 0 };

    await tx.auditLog.create({ data: {
      organizationId: store.organizationId, action: "customer.redact",
      entityType: "Store", entityId: store.id,
      after: {
        shopifyCustomerId: parsed.data.customer.id,
        ordersRequested: externalIds.length,
        ordersAnonymized: anonymizedOrders.count,
        addressesAnonymized: anonymizedAddresses.count,
      },
    } });
  });
}
