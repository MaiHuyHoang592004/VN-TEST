import type { Prisma, ExceptionCode, ExceptionVisibility } from "@fulfillflow/db";

/**
 * Channel-agnostic exception opener for core (routing/inventory/fulfillment/shipment)
 * services. Guards on the same partial unique index as the Shopify-specific
 * `openOrderException`: at most one OPEN exception per (subjectKey, code).
 */
export async function openException(
  tx: Prisma.TransactionClient,
  data: {
    organizationId: string;
    code: ExceptionCode;
    visibility: ExceptionVisibility;
    message: string;
    subjectKey: string;
    orderId?: string;
    fulfillmentId?: string;
    shipmentId?: string;
    details?: Prisma.InputJsonValue;
  },
): Promise<void> {
  const existing = await tx.exceptionCase.findFirst({ where: { subjectKey: data.subjectKey, code: data.code, status: "OPEN" } });
  if (existing) return;
  await tx.exceptionCase.create({ data });
}
