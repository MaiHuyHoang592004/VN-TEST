/**
 * `fulfillment_orders/order_routing_complete`: Shopify has finished assigning
 * this order's FulfillmentOrder(s) to a location. Refresh the resolver cache
 * so Task 18's planner reads current data instead of resolving lazily later.
 * This handler's only job is the cache refresh — the IngestionLoop settles
 * the record ACCEPTED on success by itself.
 */
import { z } from "zod";
import { prisma } from "@fulfillflow/db";
import { BusinessIngestionError } from "../../../ingestion/ingestion-errors.js";
import { resolveForOrder } from "./shopify-fulfillment-order-resolver.js";

const payloadSchema = z.object({
  fulfillment_order: z.object({
    order_id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform(String),
  }),
});

export async function processFulfillmentOrderRoutingComplete(recordId: string): Promise<void> {
  const record = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: recordId } });
  const parsed = payloadSchema.safeParse(record.rawPayload);
  if (!parsed.success) throw new BusinessIngestionError("INVALID_PAYLOAD", "Invalid fulfillment_orders/order_routing_complete payload");

  const externalId = `gid://shopify/Order/${parsed.data.fulfillment_order.order_id}`;
  const order = await prisma.order.findUnique({ where: { storeId_externalId: { storeId: record.storeId, externalId } } });
  // No canonical Order yet for this Shopify order — most likely its
  // orders/create delivery hasn't been processed yet. Retryable: waiting
  // for that to catch up is the only thing that can fix this.
  if (!order) throw new Error(`no canonical Order yet for ${externalId}`);

  await resolveForOrder(order.id, { force: true });
}
