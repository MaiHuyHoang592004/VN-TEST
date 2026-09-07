import type { FulfillmentStatus } from "@gwprint/db";

import { can } from "@gwprint/shared";

import { requireUser } from "@/modules/core/guard";
import { listOrders, orderStatusSummary } from "@/modules/fulfillment/orders/queries";
import { listWarehouses } from "@/modules/inventory/warehouses/queries";
import { PROCESSING } from "@/modules/fulfillment/orders/status";
import { OrdersTable } from "@/components/pages/orders/orders-table";
import { toOrderRow } from "@/components/pages/orders/order-row";
import { OrdersHeader } from "@/components/pages/orders/orders-header";
import { Page } from "@/components/ds";

/**
 * One page, every role. The SCOPE does the role work — a seller sees their own
 * orders, customer staff see their sites, admin/support/designer see all — so
 * there is deliberately no per-role branching here and no separate "my orders"
 * route to drift out of step.
 *
 * Tabs are canned FILTERS, not forks: each one is a status set applied to the
 * same query.
 */
const TABS: Record<string, FulfillmentStatus[] | undefined> = {
  all: undefined,
  processing: [...PROCESSING],
  attention: ["ON_HOLD"],
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const tab = one("tab") ?? "all";
  const statusParam = one("status") as FulfillmentStatus | undefined;

  const actor = await requireUser();
  // Only fetched for people who can actually assign — listWarehouses requires
  // warehouses.read, which a seller does not hold.
  const warehouses = can(actor.roles, "orders.assign") ? await listWarehouses() : [];

  // The card strip is for EVERYONE who can read orders, seller included.
  //
  // It used to be gated on orders.status.update, on the argument that "what is
  // in production right now" is a floor question rather than a seller's. That
  // was a product call, never a security one: orderStatusSummary guards on the
  // same three read grants as the list and applies orderScope(actor) to its
  // groupBy, so a seller's counts are counts of the seller's own orders and
  // nothing else. Showing it costs one scoped groupBy and gives the seller the
  // same click-to-filter the floor already had.

  const [{ rows, total }, summary] = await Promise.all([
    listOrders({
      search: one("q") || undefined,
      // An explicit status filter beats the tab's canned set — the filter is
      // the more specific thing the user just asked for.
      status: statusParam ? [statusParam] : TABS[tab],
      warehouseId: Number(one("customer")) || undefined,
      page: Number(one("page") ?? 1) || 1,
      pageSize: Number(one("size") ?? 25) || 25,
    }),
    orderStatusSummary({
      warehouseId: Number(one("customer")) || undefined,
      // Date-range aware: the cards count the same window the operator
      // filtered the table to, or everything when they have not.
      from: one("from") ? new Date(one("from") as string) : undefined,
      to: one("to") ? new Date(`${one("to")}T23:59:59.999Z`) : undefined,
    }),
  ]);

  return (
    <Page>
      <OrdersHeader />
      <OrdersTable
        total={total}
        summary={summary}
        warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
        rows={rows.map(toOrderRow)}
      />
    </Page>
  );
}
