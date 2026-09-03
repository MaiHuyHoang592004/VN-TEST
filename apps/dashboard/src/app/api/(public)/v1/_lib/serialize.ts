/**
 * The wire shape of an order.
 *
 * A named serializer rather than returning rows directly: the database shape
 * is ours to change, the API shape is a promise to someone else's code. With
 * this in the middle, renaming a row is a one-line map here instead of a
 * breaking change for every integration.
 *
 * Money is a string and every timestamp is ISO-8601 UTC — see with-api-key.ts
 * for why.
 */
import { iso, money } from "./with-api-key.ts";
import type { listOrdersCursor } from "@/modules/fulfillment/orders/service.ts";

type OrderRow = Awaited<ReturnType<typeof listOrdersCursor>>["rows"][number];

export function orderToApi(o: OrderRow) {
  const shipment = o.shipments[0];
  return {
    id: o.id,
    external_id: o.externalId,
    marketplace: o.marketplace,
    status: o.status,
    quantity: o.quantity,
    filled: o.filled,
    // The seller pays this; it is null until the order is assigned, which is
    // when it is priced.
    base_cost: money(o.baseCost),
    paid: o.paid,
    placed_at: iso(o.placedAt),
    assigned_at: iso(o.assignedAt),
    deadline: iso(o.deadline),
    variant: o.variant && { id: o.variant.id, name: o.variant.name, key: o.variant.key },
    product: o.product && { id: o.product.id, name: o.product.name, key: o.product.key },
    sku: o.productVariant && { id: o.productVariant.id, code: o.productVariant.sku },
    customer: o.customer && { id: o.customer.id, code: o.customer.code, name: o.customer.name },
    // Only the latest shipment: an order can have several, and a list endpoint
    // returning all of them makes the payload unbounded.
    tracking: shipment
      ? { number: shipment.trackingNumber, status: shipment.trackingStatus, carrier: shipment.provider }
      : null,
    note: o.note,
    // internalNote is deliberately absent — it is the customer talking to
    // itself, not something a seller's integration should read.
  };
}
