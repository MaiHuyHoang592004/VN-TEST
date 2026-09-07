import "server-only";

import { requireAnyPermission } from "../../core/guard.ts";
import * as orders from "./service.ts";

/**
 * One query for every role. The SCOPE does the role work — a seller gets
 * their own, customer staff get their sites, admin/support/designer get all —
 * so there is deliberately no listMyOrders / listWarehouseOrders split to
 * drift apart.
 *
 * The guard therefore accepts ANY of the three read grants. Asking for
 * `orders.read.own` alone was a real bug: customer and support staff hold
 * `.customer` / `.all` instead, so the page 403'd for exactly the people
 * whose job it is — found by opening /orders as a customer admin.
 */
export async function listOrders(query: orders.OrderListQuery = {}) {
  const actor = await requireAnyPermission(
    "orders.read.own",
    "orders.read.customer",
    "orders.read.all",
  );
  return orders.listOrders(actor, query);
}

export async function getOrder(id: number) {
  const actor = await requireAnyPermission(
    "orders.read.own",
    "orders.read.customer",
    "orders.read.all",
  );
  return orders.getOrder(actor, id);
}

/**
 * One order plus what this viewer may do to it — for /orders/[id].
 *
 * Both answers from ONE read and ONE guard. Asking for the order and then
 * asking again "may I edit it" would re-run the scoped query, and worse, would
 * let the two answers be computed from two different snapshots of the row: the
 * form could be enabled against a status the order no longer has.
 */
export async function getOrderDetail(id: number) {
  const actor = await requireAnyPermission(
    "orders.read.own",
    "orders.read.customer",
    "orders.read.all",
  );
  // The GUARD runs outside the catch on purpose. requireAnyPermission refuses
  // by THROWING Next's forbidden() signal, and a try/catch wide enough to
  // include it would swallow the refusal and turn a 403 into a 404 — or worse,
  // into a rendered page. Only the query is allowed to fail quietly here, and
  // its only expected failure is findFirstOrThrow finding nothing: either no
  // such order, or one this actor's scope does not reach. Both are "no", and
  // the caller must not be able to tell which.
  const order = await orders.getOrder(actor, id).catch(() => null);
  if (!order) return null;
  return { order, policy: orders.orderEditPolicy(actor, order) };
}

/**
 * The artwork thumbnail behind /api/orders/<id>/thumb. Same three read grants
 * as the list: if you may see the order, you may see its design.
 */
export async function orderArtwork(id: number) {
  const actor = await requireAnyPermission(
    "orders.read.own",
    "orders.read.customer",
    "orders.read.all",
  );
  return orders.orderArtwork(actor, id);
}

/**
 * The status card strip above the table. Same guard as the list — the cards
 * ARE the list, counted.
 *
 * It takes the same `search` and date window the list takes, and the service
 * builds both clauses with one function. Pass the page's filter WHOLE: giving
 * the cards a narrower filter than the table beneath them is what made them
 * disagree, and nothing here can detect that you did.
 */
export async function orderStatusSummary(query: orders.OrderSummaryQuery = {}) {
  const actor = await requireAnyPermission(
    "orders.read.own",
    "orders.read.customer",
    "orders.read.all",
  );
  return orders.orderStatusSummary(actor, query);
}

/**
 * A `?from=` / `?to=` out of the URL, as a Date the queries above can take.
 *
 * Re-exported here so a page parses its search params with the same function
 * the service trusts, and one import serves both. It is pure and unguarded on
 * purpose — parsing a string is not a read.
 */
export { parseDateParam } from "./service.ts";

/**
 * The five milestones behind one order's expanded row.
 *
 * Same guard as the list, and the service applies the same scope on top, so a
 * seller asking for someone else's order id gets an empty timeline rather than
 * a 403 that would confirm the row exists.
 *
 * Fetched per row on expand rather than for all 25 up front: the panel is one
 * row at a time, and joining an audit trail onto every page of the list to
 * render one of them is work nobody asked for.
 */
export async function orderTimeline(id: number) {
  const actor = await requireAnyPermission(
    "orders.read.own",
    "orders.read.customer",
    "orders.read.all",
  );
  return orders.orderTimeline(actor, id);
}
