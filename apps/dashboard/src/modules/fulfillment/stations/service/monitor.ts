/**
 * The floor monitor — every parcel in flight, one column each.
 *
 * Grouping happens in SQL, not in JavaScript. Legacy fetched orders and
 * grouped them in app code, which meant its pagination counted ORDERS while
 * the screen showed GROUPS: "1–25 of 812" over a table with nine rows in it,
 * and a "next page" that skipped parcels entirely. Aggregating in the database
 * makes the count and the page agree by construction.
 *
 * Prisma cannot express "group by a row on the joined latest shipment", so
 * this is raw SQL — with the actor's scope compiled in via orderScopeSql,
 * which is derived from the same policy primitives as orderScope. Never
 * interpolate anything else by hand: every value below is a bound parameter.
 */
import { prisma, orderScopeSql, Prisma, type FulfillmentStatus } from "@opcreative/db";

import { type Actor } from "./group.ts";

export type MonitorFilter = "open" | "ready" | "all";

export type TrackingGroupSummary = {
  key: string;
  trackingNumber: string | null;
  customer: string | null;
  orderCount: number;
  totalQuantity: number;
  totalFilled: number;
  statuses: FulfillmentStatus[];
  labelUrl: string | null;
  basket: string | null;
  oldestPlacedAt: string;
};

type Row = {
  key: string;
  anchor_id: number;
  tracking_number: string | null;
  customer: string | null;
  order_count: number;
  total_quantity: number;
  total_filled: number;
  statuses: string[];
  label_url: string | null;
  basket: string | null;
  oldest_placed_at: Date;
};

/** Anything not yet packed. ON_HOLD counts as open — a held parcel is the one
 * most in need of a human looking at this page. */
const OPEN_STATUSES = ["PENDING", "ASSIGNED", "IN_PRODUCTION", "ON_HOLD"];

export async function listTrackingGroups(
  actor: Actor,
  opts: { filter?: MonitorFilter; cursor?: number; limit?: number } = {},
): Promise<{ groups: TrackingGroupSummary[]; nextCursor: number | null }> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const scope = await orderScopeSql(actor);

  const conditions: Prisma.Sql[] = [];
  if (opts.filter === "ready") conditions.push(Prisma.sql`bool_and(o.status = 'FULFILLED')`);
  if (opts.filter === "open") {
    conditions.push(Prisma.sql`bool_or(o.status::text = ANY(${OPEN_STATUSES}::text[]))`);
  }
  // The cursor is the group's ANCHOR — the lowest order id in it. One row,
  // unique per group (an order belongs to exactly one parcel), and stable when
  // orders arrive mid-walk, which is exactly what offset paging is not.
  if (opts.cursor) conditions.push(Prisma.sql`MIN(o.id) > ${opts.cursor}`);
  const having = conditions.length
    ? Prisma.sql`HAVING ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Row[]>`
    WITH latest AS (
      SELECT DISTINCT ON (order_id) order_id, tracking_number, label_url
      FROM shipments
      ORDER BY order_id, created_at DESC
    )
    SELECT
      COALESCE(l.tracking_number, regexp_replace(o.external_id, '-[^-]*$', ''), 'order:' || o.id::text) AS key,
      MIN(o.id)::int                                        AS anchor_id,
      MAX(l.tracking_number)                                AS tracking_number,
      MIN(COALESCE(u.name, u.email))                        AS customer,
      COUNT(*)::int                                         AS order_count,
      SUM(o.quantity)::int                                  AS total_quantity,
      SUM(o.filled)::int                                    AS total_filled,
      ARRAY_AGG(DISTINCT o.status::text)                    AS statuses,
      MAX(l.label_url)                                      AS label_url,
      MIN(COALESCE(b.name, CONCAT(b.shelf_name, b.row, b.column))) AS basket,
      MIN(o.placed_at)                                      AS oldest_placed_at
    FROM orders o
    LEFT JOIN latest l           ON l.order_id = o.id
    LEFT JOIN basket_positions b ON b.id = o.basket_position_id
    LEFT JOIN users u            ON u.id = o.customer_id
    WHERE o.deleted_at IS NULL AND ${scope}
    GROUP BY key
    ${having}
    ORDER BY anchor_id ASC
    LIMIT ${limit + 1}
  `;

  // One extra row answers "is there more?" without a second aggregate query.
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    groups: page.map((r) => ({
      key: r.key,
      trackingNumber: r.tracking_number,
      customer: r.customer,
      orderCount: r.order_count,
      totalQuantity: r.total_quantity,
      totalFilled: r.total_filled,
      statuses: r.statuses as FulfillmentStatus[],
      labelUrl: r.label_url,
      basket: r.basket,
      oldestPlacedAt: r.oldest_placed_at.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].anchor_id : null,
  };
}
