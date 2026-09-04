import { prisma, orderScope, type Prisma } from "@gwprint/db";

import type { Actor } from "./shared.ts";

/**
 * The five milestones the expanded order row draws.
 *
 * NOT the nine `FulfillmentStatus` values, and that is the point: ASSIGNED is
 * a routing decision rather than a thing that happens to the parcel, and
 * CANCELLED / REFUNDED / ON_HOLD are exits from the line, not points on it.
 * A row in one of those exits still shows how far it got before it left.
 */
export const TIMELINE_STEPS = [
  "PENDING",
  "IN_PRODUCTION",
  "FULFILLED",
  "SHIPPED",
  "DELIVERED",
] as const;

export type TimelineStep = (typeof TIMELINE_STEPS)[number];

export type TimelineEntry = {
  status: TimelineStep;
  /** ISO string, or null when the step is reached but its moment is unknown. */
  at: string | null;
  reached: boolean;
};

/** Index of a status on the line, or -1 for the three exits. */
const positionOf = (status: string) =>
  TIMELINE_STEPS.indexOf(status as TimelineStep);

/**
 * When an order sits in an exit (ON_HOLD / CANCELLED / REFUNDED) its current
 * status says nothing about how far down the line it travelled, so the furthest
 * milestone it was ever AUDITED into is what the timeline fills to.
 */
function furthestReached(current: string, seen: Set<string>): number {
  let best = positionOf(current);
  for (const status of seen) best = Math.max(best, positionOf(status));
  // Every order was PENDING once, even one whose audit trail predates the log.
  return Math.max(best, 0);
}

/**
 * When each milestone happened, for one order.
 *
 * Read from the AUDIT LOG rather than from columns on the order, because the
 * order carries only three moments (`placedAt`, `assignedAt`, `fulfilledAt`)
 * and the design asks for five. Every status change goes through
 * `changeStatus`, which writes an `ORDER_STATUS_CHANGED` row inside the same
 * transaction as the change — so the log is not a best-effort trail, it is the
 * record, and it cannot disagree with the order's own status.
 *
 * A step that is reached but has no audit row (data older than the log, or an
 * order imported mid-flight) returns `at: null` and the UI shows an em dash.
 * Inventing a date from `updatedAt` would put a number on the screen that
 * nothing stands behind.
 *
 * Scoped like every other order read: a seller can only ask about their own.
 */
export async function orderTimeline(
  actor: Actor,
  orderId: number,
): Promise<TimelineEntry[]> {
  const scope: Prisma.OrderWhereInput = await orderScope(actor);

  const order = await prisma.order.findFirst({
    where: { AND: [scope, { id: orderId, deletedAt: null }] },
    select: { id: true, status: true, placedAt: true, fulfilledAt: true },
  });
  // Out of scope and not found are the same answer on purpose — a 404 that
  // only appears for rows you may not see is itself a disclosure.
  if (!order) return [];

  const log = await prisma.auditLog.findMany({
    where: {
      targetType: "order",
      targetId: String(orderId),
      action: "ORDER_STATUS_CHANGED",
    },
    select: { after: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  /** First time the order entered a status — a resumed ON_HOLD must not
   *  overwrite the original moment with the later one. */
  const firstEntry = new Map<string, Date>();
  for (const row of log) {
    const status = (row.after as { status?: string } | null)?.status;
    if (status && !firstEntry.has(status)) firstEntry.set(status, row.createdAt);
  }

  const furthest = furthestReached(order.status, new Set(firstEntry.keys()));

  return TIMELINE_STEPS.map((status, i) => {
    // PENDING is the row's own creation; FULFILLED has a column of its own that
    // predates the audit log. Both beat the log for orders migrated in.
    const fallback =
      status === "PENDING"
        ? order.placedAt
        : status === "FULFILLED"
          ? order.fulfilledAt
          : null;
    const at = firstEntry.get(status) ?? fallback;
    return {
      status,
      at: i <= furthest && at ? at.toISOString() : null,
      reached: i <= furthest,
    };
  });
}
