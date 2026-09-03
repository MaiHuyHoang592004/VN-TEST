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
 * The status card strip above the table. Same guard as the list — the cards
 * ARE the list, counted.
 */
export async function orderStatusSummary(
  query: { warehouseId?: number; from?: Date; to?: Date } = {},
) {
  const actor = await requireAnyPermission(
    "orders.read.own",
    "orders.read.customer",
    "orders.read.all",
  );
  return orders.orderStatusSummary(actor, query);
}
