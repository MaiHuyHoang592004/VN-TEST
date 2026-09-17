import type { PrismaClient } from "@fulfillflow/db";

export type OverviewWindow = "24h" | "7d";
const WINDOW_HOURS: Record<OverviewWindow, number> = { "24h": 24, "7d": 168 };

export type OverviewMetrics = {
  window: OverviewWindow;
  ordersReceived: number;
  straightThroughOrders: number;
  straightThroughRate: number;
  needsAttention: number;
  manualTouchRate: number;
  shopifySyncSuccessRate: number | null;
  definitions: Record<string, string>;
};

const DEFINITIONS = {
  ordersReceived: "Orders placed in this window (by Order.placedAt), regardless of outcome.",
  straightThroughOrders: "Of those, orders that have never had any exception opened against them.",
  straightThroughRate: "straightThroughOrders / ordersReceived.",
  needsAttention: "Of those, orders with a currently OPEN merchant-visible exception.",
  manualTouchRate: "needsAttention / ordersReceived.",
  shopifySyncSuccessRate: "DELIVERED / total Shopify fulfillment sync attempts in this window (null if none were attempted).",
};

/**
 * Every number here comes from real rows for this org in the selected
 * window — never an invented benchmark. "Straight-through" and "needs
 * attention" both key off whether an order ever had (or currently has) an
 * exception, which is the same signal the merchant Orders page would use
 * for its "Needs attention" tab if one existed (M3 explicitly descoped that
 * UI — HANDOVER-M3 — this endpoint doesn't depend on it).
 */
export async function computeOverview(
  prisma: PrismaClient, organizationId: string, window: OverviewWindow = "24h", now = new Date(),
): Promise<OverviewMetrics> {
  const windowStart = new Date(now.getTime() - WINDOW_HOURS[window] * 60 * 60_000);

  const orders = await prisma.order.findMany({ where: { organizationId, placedAt: { gte: windowStart } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const ordersReceived = orderIds.length;

  const [everExceptioned, currentlyAttention, deliveryAttempts] = await Promise.all([
    orderIds.length > 0
      ? prisma.exceptionCase.findMany({ where: { organizationId, orderId: { in: orderIds } }, select: { orderId: true }, distinct: ["orderId"] })
      : Promise.resolve([]),
    orderIds.length > 0
      ? prisma.exceptionCase.findMany({ where: { organizationId, orderId: { in: orderIds }, visibility: "MERCHANT", status: "OPEN" }, select: { orderId: true }, distinct: ["orderId"] })
      : Promise.resolve([]),
    prisma.deliveryAttempt.findMany({
      where: { createdAt: { gte: windowStart }, outboxEvent: { organizationId, handler: "shopify.fulfillment.create" } },
      select: { status: true },
    }),
  ]);

  const straightThroughOrders = ordersReceived - everExceptioned.length;
  const needsAttention = currentlyAttention.length;
  const shopifySyncSuccessRate = deliveryAttempts.length > 0
    ? deliveryAttempts.filter((d) => d.status === "DELIVERED").length / deliveryAttempts.length
    : null;

  return {
    window, ordersReceived, straightThroughOrders,
    straightThroughRate: ordersReceived > 0 ? straightThroughOrders / ordersReceived : 0,
    needsAttention,
    manualTouchRate: ordersReceived > 0 ? needsAttention / ordersReceived : 0,
    shopifySyncSuccessRate,
    definitions: DEFINITIONS,
  };
}
