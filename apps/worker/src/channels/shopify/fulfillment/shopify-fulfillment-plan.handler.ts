/**
 * `shopify.fulfillment.plan`: internal planner, no external call. Reads
 * ShipmentItems for the Shipment named in the event payload, resolves each
 * one's FulfillmentOrder line from the Task 17 cache ONLY (a cache miss is
 * left for the fulfillment_orders/order_routing_complete handler or a later
 * lazy resolve to fill in — the planner itself never calls Shopify, so it
 * creates no DeliveryAttempt), validates remaining quantities, and groups
 * allocations by assignedLocationId. In one transaction: marks its own event
 * SENT and creates exactly one child `shopify.fulfillment.create` OutboxEvent
 * per location group — the one-outbox-row-per-external-side-effect
 * invariant. A quantity mismatch (Shopify's remaining quantity no longer
 * covers this shipment — most likely a manual fulfillment in the Shopify
 * admin) settles as a merchant-visible CHANNEL_SYNC_FAILED instead of
 * emitting any create event.
 */
import { z } from "zod";
import { prisma, type ClaimedOutbox } from "@fulfillflow/db";
import { openException } from "@fulfillflow/core";

const payloadSchema = z.object({ shipmentId: z.string().min(1) });

export async function planShopifyFulfillment(event: ClaimedOutbox): Promise<void> {
  const { shipmentId } = payloadSchema.parse(event.payload);

  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: {
      items: { include: { fulfillmentItem: { select: { orderItemId: true } } } },
      fulfillment: { select: { order: { select: { organizationId: true } } } },
    },
  });
  const organizationId = shipment.fulfillment.order.organizationId;

  const orderItemIds = shipment.items.map((si) => si.fulfillmentItem.orderItemId);
  const cachedLines = await prisma.shopifyFulfillmentOrderLine.findMany({ where: { orderItemId: { in: orderItemIds } } });
  const lineByOrderItemId = new Map(cachedLines.map((l) => [l.orderItemId, l]));

  const unresolved = shipment.items.filter((si) => {
    const line = lineByOrderItemId.get(si.fulfillmentItem.orderItemId);
    return !line || line.assignedLocationId === null;
  });
  if (unresolved.length > 0) {
    throw new Error(`FulfillmentOrder cache incomplete for shipment ${shipmentId}: ${unresolved.length} item(s) unresolved`);
  }

  const mismatched = shipment.items.filter((si) => si.quantity > lineByOrderItemId.get(si.fulfillmentItem.orderItemId)!.remainingQuantity);
  if (mismatched.length > 0) {
    await prisma.$transaction(async (tx) => {
      await openException(tx, {
        organizationId, code: "CHANNEL_SYNC_FAILED", visibility: "MERCHANT",
        shipmentId, subjectKey: `shipment:${shipmentId}`,
        message: "This shipment's quantities no longer fit what Shopify has remaining to fulfill — it may already have been fulfilled manually in Shopify admin.",
        details: {
          mismatched: mismatched.map((si) => ({
            fulfillmentItemId: si.fulfillmentItemId, shippedQuantity: si.quantity,
            remainingQuantity: lineByOrderItemId.get(si.fulfillmentItem.orderItemId)!.remainingQuantity,
          })),
        },
      });
      await tx.outboxEvent.update({ where: { id: event.id }, data: { status: "SENT", processedAt: new Date() } });
    });
    return;
  }

  const groups = new Map<string, Array<{ fulfillmentOrderId: string; fulfillmentOrderLineItemId: string; quantity: number }>>();
  for (const si of shipment.items) {
    const line = lineByOrderItemId.get(si.fulfillmentItem.orderItemId)!;
    const list = groups.get(line.assignedLocationId!) ?? [];
    list.push({ fulfillmentOrderId: line.fulfillmentOrderId, fulfillmentOrderLineItemId: line.fulfillmentOrderLineItemId, quantity: si.quantity });
    groups.set(line.assignedLocationId!, list);
  }

  await prisma.$transaction(async (tx) => {
    for (const [assignedLocationId, allocations] of groups) {
      await tx.outboxEvent.create({ data: {
        organizationId,
        eventKey: `shipment.sync:${shipmentId}:${assignedLocationId}`,
        aggregateType: "Shipment", aggregateId: shipmentId,
        handler: "shopify.fulfillment.create",
        payload: { shipmentId, assignedLocationId, allocations },
      } });
    }
    await tx.outboxEvent.update({ where: { id: event.id }, data: { status: "SENT", processedAt: new Date() } });
  });
}
