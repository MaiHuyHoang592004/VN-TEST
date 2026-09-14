import { routeOrder } from "./routing.service.js";
import { reserveFulfillment } from "../inventory/inventory-reservation.service.js";

/**
 * Called once, right after an ingestion handler commits a newly-accepted
 * Order. Both steps settle expected business conditions internally (a
 * NO_ROUTE decision or a BLOCKED Fulfillment plus one INTERNAL exception)
 * instead of throwing, so this never fails the ingestion record that has
 * already been committed ACCEPTED — only a genuine infrastructure error
 * propagates.
 */
export async function routeAndReserve(orderId: string): Promise<void> {
  const { fulfillmentId } = await routeOrder(orderId);
  if (fulfillmentId) await reserveFulfillment(fulfillmentId);
}
