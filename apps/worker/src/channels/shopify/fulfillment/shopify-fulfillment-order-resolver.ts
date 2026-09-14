/**
 * Resolves and caches Shopify FulfillmentOrder line items for a canonical
 * Order. `ShopifyFulfillmentOrderLine` is the cache: keyed by Shopify's own
 * `fulfillmentOrderLineItemId`, mapped back to `OrderItem` via the line
 * item's original order-line gid (`OrderItem.externalLineId`). Task 18's
 * planner reads this cache (falling back to a lazy resolve here on a miss)
 * instead of calling Shopify on every outbox tick.
 */
import { prisma } from "@fulfillflow/db";
import { shopifyGraphql, openException } from "@fulfillflow/core";
import { shopifyTokenManager } from "../shopify-client.js";

export type ResolvedFulfillmentOrderLine = {
  fulfillmentOrderId: string;
  fulfillmentOrderLineItemId: string;
  orderItemId: string;
  remainingQuantity: number;
  assignedLocationId: string | null;
};

type ShopifyFulfillmentOrderLineNode = { id: string; remainingQuantity: number; lineItem: { id: string } };
type ShopifyFulfillmentOrderNode = {
  id: string;
  assignedLocation: { location: { id: string; fulfillmentService: { id: string } | null } | null } | null;
  lineItems: { nodes: ShopifyFulfillmentOrderLineNode[] };
};
type OrderFulfillmentOrdersData = { order: { fulfillmentOrders: { nodes: ShopifyFulfillmentOrderNode[] } } | null };

const FULFILLMENT_ORDERS_QUERY = `
  query OrderFulfillmentOrders($id: ID!) {
    order(id: $id) {
      fulfillmentOrders(first: 25) {
        nodes {
          id
          assignedLocation { location { id fulfillmentService { id } } }
          lineItems(first: 100) { nodes { id remainingQuantity lineItem { id } } }
        }
      }
    }
  }`;

export type QueryFulfillmentOrders = (shop: string, accessToken: string, orderGid: string) => Promise<ShopifyFulfillmentOrderNode[]>;

async function defaultQueryFulfillmentOrders(shop: string, accessToken: string, orderGid: string): Promise<ShopifyFulfillmentOrderNode[]> {
  const data = await shopifyGraphql<OrderFulfillmentOrdersData>(shop, accessToken, FULFILLMENT_ORDERS_QUERY, { id: orderGid });
  return data.order?.fulfillmentOrders.nodes ?? [];
}

/** Shopify hasn't finished routing this order to a FulfillmentOrder yet. Retryable — not a business failure. */
export class FulfillmentOrderNotReadyError extends Error {}

function toResolved(row: { fulfillmentOrderId: string; fulfillmentOrderLineItemId: string; orderItemId: string; remainingQuantity: number; assignedLocationId: string | null }): ResolvedFulfillmentOrderLine {
  return {
    fulfillmentOrderId: row.fulfillmentOrderId,
    fulfillmentOrderLineItemId: row.fulfillmentOrderLineItemId,
    orderItemId: row.orderItemId,
    remainingQuantity: row.remainingQuantity,
    assignedLocationId: row.assignedLocationId,
  };
}

type TokenManagerLike = { withAccessToken<T>(storeId: string, fn: (accessToken: string) => Promise<T>): Promise<T> };

export async function resolveForOrder(
  orderId: string,
  options?: { force?: boolean },
  deps: { queryFulfillmentOrders?: QueryFulfillmentOrders; tokenManager?: TokenManagerLike } = {},
): Promise<ResolvedFulfillmentOrderLine[]> {
  const queryFulfillmentOrders = deps.queryFulfillmentOrders ?? defaultQueryFulfillmentOrders;
  const tokenManager = deps.tokenManager ?? shopifyTokenManager;
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, store: true } });

  if (!options?.force && order.items.length > 0) {
    const cached = await prisma.shopifyFulfillmentOrderLine.findMany({ where: { orderItemId: { in: order.items.map((i) => i.id) } } });
    const coveredItemIds = new Set(cached.map((c) => c.orderItemId));
    if (order.items.every((i) => coveredItemIds.has(i.id))) return cached.map(toResolved);
  }

  const nodes = await tokenManager.withAccessToken(order.storeId, (accessToken) =>
    queryFulfillmentOrders(order.store.externalStoreId, accessToken, order.externalId));
  if (nodes.length === 0) throw new FulfillmentOrderNotReadyError(`no FulfillmentOrder yet for order ${orderId}`);

  const unsupported = nodes.filter((n) => n.assignedLocation?.location?.fulfillmentService);
  const supported = nodes.filter((n) => !n.assignedLocation?.location?.fulfillmentService);

  if (unsupported.length > 0) {
    await prisma.$transaction((tx) => openException(tx, {
      organizationId: order.organizationId,
      code: "CHANNEL_SYNC_FAILED",
      visibility: "MERCHANT",
      orderId: order.id,
      subjectKey: `order:${order.id}`,
      message: "This order is assigned to a Shopify fulfillment-service location, which this app does not support — only merchant-managed locations are.",
      details: {
        unsupportedFulfillmentOrderIds: unsupported.map((n) => n.id),
        assignedLocationIds: unsupported.map((n) => n.assignedLocation?.location?.id ?? null),
      },
    }));
  }

  return prisma.$transaction(async (tx) => {
    const results: ResolvedFulfillmentOrderLine[] = [];
    for (const fo of supported) {
      const assignedLocationId = fo.assignedLocation?.location?.id ?? null;
      for (const line of fo.lineItems.nodes) {
        const orderItem = order.items.find((i) => i.externalLineId === line.lineItem.id);
        if (!orderItem) continue; // Shopify line doesn't map to any OrderItem on this canonical order — nothing to cache.
        const row = await tx.shopifyFulfillmentOrderLine.upsert({
          where: { fulfillmentOrderLineItemId: line.id },
          create: {
            orderItemId: orderItem.id, fulfillmentOrderId: fo.id, fulfillmentOrderLineItemId: line.id,
            remainingQuantity: line.remainingQuantity, assignedLocationId, resolvedAt: new Date(),
          },
          update: { remainingQuantity: line.remainingQuantity, assignedLocationId, resolvedAt: new Date() },
        });
        results.push(toResolved(row));
      }
    }
    return results;
  });
}
