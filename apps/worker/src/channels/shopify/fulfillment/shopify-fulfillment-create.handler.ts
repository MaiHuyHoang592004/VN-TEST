/**
 * `shopify.fulfillment.create`: exactly one `fulfillmentCreate` GraphQL
 * mutation for this event's allocations (all belonging to one assigned
 * location — Task 18's planner already split a multi-location shipment into
 * one event per location). `userErrors` in the mutation response is a
 * permanent business failure (dead-letter, one merchant-visible
 * CHANNEL_SYNC_FAILED); a transport/protocol-level retryable failure
 * (429/5xx/network, GraphQL cost throttling) is retried, honoring Shopify's
 * Retry-After header or throttle-cost estimate when present. Every HTTP
 * attempt writes exactly one DeliveryAttempt row.
 */
import { z } from "zod";
import { prisma, type ClaimedOutbox } from "@fulfillflow/db";
import { shopifyGraphql, openException, ShopifyRetryableError } from "@fulfillflow/core";
import { shopifyTokenManager } from "../shopify-client.js";
import { BusinessOutboxError, RetryableOutboxError } from "../../../queue/outbox-errors.js";

const payloadSchema = z.object({
  shipmentId: z.string().min(1),
  assignedLocationId: z.string().min(1),
  allocations: z.array(z.object({
    fulfillmentOrderId: z.string().min(1),
    fulfillmentOrderLineItemId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
});

const FULFILLMENT_CREATE_MUTATION = `
  mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment { id }
      userErrors { field message }
    }
  }`;

type UserError = { field?: string[] | null; message: string };
type FulfillmentCreateData = { fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: UserError[] } };

function groupAllocationsByFulfillmentOrder(allocations: Array<{ fulfillmentOrderId: string; fulfillmentOrderLineItemId: string; quantity: number }>) {
  const byFo = new Map<string, Array<{ id: string; quantity: number }>>();
  for (const a of allocations) {
    const list = byFo.get(a.fulfillmentOrderId) ?? [];
    list.push({ id: a.fulfillmentOrderLineItemId, quantity: a.quantity });
    byFo.set(a.fulfillmentOrderId, list);
  }
  return [...byFo.entries()].map(([fulfillmentOrderId, fulfillmentOrderLineItems]) => ({ fulfillmentOrderId, fulfillmentOrderLineItems }));
}

export async function createShopifyFulfillment(event: ClaimedOutbox): Promise<void> {
  const { shipmentId, assignedLocationId, allocations } = payloadSchema.parse(event.payload);

  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { fulfillment: { select: { order: { select: { organizationId: true, storeId: true, store: { select: { externalStoreId: true } } } } } } },
  });

  if (shipment.externalFulfillmentId) {
    // Already synced. Only skip a second mutation when this event is the
    // shipment's one and only location group — V1's demo data is always a
    // single group, and a genuine multi-group shipment needs each group's
    // own mutation regardless of whether a sibling already succeeded.
    const siblingCreateEvents = await prisma.outboxEvent.count({
      where: { aggregateId: shipmentId, handler: "shopify.fulfillment.create" },
    });
    if (siblingCreateEvents === 1) return;
  }

  const { organizationId, storeId, store } = shipment.fulfillment.order;
  const variables = {
    fulfillment: {
      lineItemsByFulfillmentOrder: groupAllocationsByFulfillmentOrder(allocations),
      trackingInfo: {
        number: shipment.trackingNumber ?? undefined,
        url: shipment.trackingUrl ?? undefined,
        company: shipment.provider,
      },
      notifyCustomer: true,
    },
  };

  let data: FulfillmentCreateData;
  try {
    data = await shopifyTokenManager.withAccessToken(storeId, (accessToken) =>
      shopifyGraphql<FulfillmentCreateData>(store.externalStoreId, accessToken, FULFILLMENT_CREATE_MUTATION, variables));
  } catch (err) {
    if (err instanceof ShopifyRetryableError) {
      await prisma.deliveryAttempt.create({ data: {
        outboxEventId: event.id, attempt: event.attempts, status: "FAILED",
        error: err.message.slice(0, 2000),
      } });
      throw new RetryableOutboxError(err.message, err.retryAfterSeconds);
    }
    await prisma.deliveryAttempt.create({ data: {
      outboxEventId: event.id, attempt: event.attempts, status: "FAILED",
      error: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
    } });
    throw err;
  }

  await prisma.deliveryAttempt.create({ data: {
    outboxEventId: event.id, attempt: event.attempts, status: "DELIVERED", httpStatus: 200,
    responseExcerpt: JSON.stringify(data).slice(0, 2000),
  } });

  if (data.fulfillmentCreate.userErrors.length > 0) {
    const message = data.fulfillmentCreate.userErrors.map((e) => e.message).join("; ");
    await prisma.$transaction((tx) => openException(tx, {
      organizationId, code: "CHANNEL_SYNC_FAILED", visibility: "MERCHANT",
      shipmentId, subjectKey: `shipment:${shipmentId}`,
      message: `Shopify rejected this fulfillment: ${message}`,
      details: { userErrors: data.fulfillmentCreate.userErrors, assignedLocationId },
    }));
    throw new BusinessOutboxError(`fulfillmentCreate userErrors: ${message}`);
  }

  const fulfillmentGid = data.fulfillmentCreate.fulfillment?.id;
  await prisma.$transaction(async (tx) => {
    if (!shipment.externalFulfillmentId && fulfillmentGid) {
      await tx.shipment.update({ where: { id: shipmentId }, data: { externalFulfillmentId: fulfillmentGid } });
    }
    for (const allocation of allocations) {
      await tx.shopifyFulfillmentOrderLine.updateMany({
        where: { fulfillmentOrderLineItemId: allocation.fulfillmentOrderLineItemId },
        data: { remainingQuantity: { decrement: allocation.quantity } },
      });
    }
  });
}
