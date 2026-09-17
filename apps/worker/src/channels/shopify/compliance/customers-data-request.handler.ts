/**
 * `customers/data_request`: a customer asked the merchant for their data.
 * V1 does not auto-export a package — this records the request as an
 * operator-visible AuditLog entry (request metadata only: which customer,
 * which orders were named) so a human can fulfill it manually. No email or
 * phone number is persisted here; that's the "unnecessary PII" the plan
 * warns against duplicating when the customer id already identifies the
 * request.
 */
import { z } from "zod";
import { prisma } from "@fulfillflow/db";
import { BusinessIngestionError } from "../../../ingestion/ingestion-errors.js";

const payloadSchema = z.object({
  customer: z.object({ id: z.union([z.string(), z.number()]).transform(String) }),
  orders_requested: z.array(z.union([z.string(), z.number()]).transform(String)).optional().default([]),
});

export async function processCustomersDataRequest(recordId: string): Promise<void> {
  const record = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: recordId } });
  const parsed = payloadSchema.safeParse(record.rawPayload);
  if (!parsed.success) throw new BusinessIngestionError("INVALID_PAYLOAD", "Invalid customers/data_request payload");
  const store = await prisma.store.findUniqueOrThrow({ where: { id: record.storeId } });

  await prisma.auditLog.create({ data: {
    organizationId: store.organizationId, action: "customer.data_request",
    entityType: "Store", entityId: store.id,
    after: { shopifyCustomerId: parsed.data.customer.id, ordersRequested: parsed.data.orders_requested.length },
  } });
}
