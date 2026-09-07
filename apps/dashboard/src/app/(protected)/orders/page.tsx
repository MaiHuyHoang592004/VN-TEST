import { can } from "@gwprint/shared";

import { requireUser } from "@/modules/core/guard";
import {
  listOrders,
  orderStatusSummary,
  parseDateParam,
} from "@/modules/fulfillment/orders/queries";
import { listWarehouses } from "@/modules/inventory/warehouses/queries";
import { OrdersTable } from "@/components/pages/orders/orders-table";
import { toOrderRow } from "@/components/pages/orders/order-row";
import { OrdersHeader } from "@/components/pages/orders/orders-header";
import { readOrderFilter } from "@/components/pages/orders/order-filters";
import { Page } from "@/components/ds";

/**
 * One page, every role. The SCOPE does the role work — a seller sees their own
 * orders, customer staff see their sites, admin/support/designer see all — so
 * there is deliberately no per-role branching here and no separate "my orders"
 * route to drift out of step.
 *
 * Tabs are canned FILTERS, not forks: each one is a status set applied to the
 * same query. That map used to live here as a local `TABS`; it is now
 * TAB_STATUSES in order-filters.ts, because the select-all action has to
 * resolve the same tab and a second copy of the map selected the wrong rows.
 */
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

  /**
   * THE FILTER, BUILT ONCE.
   *
   * The list and the summary cards used to each assemble their own: the cards
   * took `from`/`to` and the list did not, the list took a search the cards did
   * not, and the result was a date-filtered table sitting under cards counting
   * a different set of orders — which is worse than no cards at all. Both now
   * read the same four values from the same expressions, so they cannot drift
   * apart again. The one difference left is the one that has to be there: the
   * cards take no `status`, because they ARE the per-status breakdown.
   *
   * READ BY order-filters.ts rather than by expressions written out here.
   * `?tab=`, `?status=`, `?q=`, the site (including its legacy `?customer=`
   * spelling), the seller and the date window all resolve in readOrderFilter,
   * because the TABLE has to resolve the identical set for "select all N
   * matching" — and while the two were written out separately the table's copy
   * silently dropped `?tab=` and the legacy site alias, so the strip offered
   * thirty rows and the action came back with two thousand.
   *
   * DATES ARE UTC DAY BOUNDS, and `to` is INCLUSIVE. The param names a calendar
   * day (`YYYY-MM-DD`), so the end of the range has to be the last instant of
   * that day or picking "7 Sep – 7 Sep" would return nothing. readOrderFilter
   * appends that bound, which is also what makes it the same instant the
   * select-all action is given. Same convention the deadline column uses, so
   * the two cannot disagree about which day an order belongs to.
   */
  const filter = readOrderFilter(one);
  // Parsed with the SERVICE's own parseDateParam rather than `new Date(...)`:
  // `new Date("last tuesday")` is an Invalid Date and handing one of those to
  // Prisma is a 500, so a mistyped or stale `?from=` in somebody's bookmark
  // would take the whole page down instead of being ignored. queries.ts
  // re-exports the function precisely so a page parses its params the same way
  // the query it feeds does.
  const from = parseDateParam(filter.from);
  const to = parseDateParam(filter.to);

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
      search: filter.search,
      // An explicit `?status=` already beat the tab's canned set inside
      // readOrderFilter — the filter is the more specific thing the user just
      // asked for.
      status: filter.status,
      warehouseId: filter.warehouseId,
      customerId: filter.customerId,
      // The date window the toolbar's DateRangeField writes. The list honours
      // it as of this change; before it, only the cards did, so a date-filtered
      // screen showed cards and rows counting different things.
      from,
      to,
      // The table's own header cells write these. The whitelist lives in
      // service/reads.ts and a key it does not know falls back to the default
      // order rather than throwing, so a bookmark made before a column was
      // renamed still renders a page.
      sort: one("sort"),
      dir: one("dir") === "asc" ? "asc" : "desc",
      page: Number(one("page") ?? 1) || 1,
      pageSize: Number(one("size") ?? 25) || 25,
    }),
    orderStatusSummary({
      warehouseId: filter.warehouseId,
      // Date-range aware: the cards count the same window the operator
      // filtered the table to, or everything when they have not.
      from,
      to,
      // The SAME search the list gets. Omitting it here is the drift the
      // summary's own doc comment warns about — a searched table under cards
      // counting the unsearched set.
      search: filter.search,
      // AND the same seller. This was the one filter the summary did not
      // carry, on the argument that OrderSummaryQuery had no field for it —
      // which stopped being a reason the moment the Seller column became a
      // filter and these same rows started feeding the header chips' counts:
      // clicking a name dropped the table to twelve orders under chips and
      // cards still reading 5,312. The honest fix was the field, so
      // OrderSummaryQuery carries `customerId` now and both queries narrow
      // together — which is what reads.test.ts asserts.
      customerId: filter.customerId,
    }),
  ]);

  return (
    <Page>
      {/* The header chips carry COUNTS now, from the same summary the cards
          read — see orders-header.tsx for why they could not before and can. */}
      <OrdersHeader summary={summary} />
      <OrdersTable
        total={total}
        summary={summary}
        warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
        rows={rows.map(toOrderRow)}
      />
    </Page>
  );
}
