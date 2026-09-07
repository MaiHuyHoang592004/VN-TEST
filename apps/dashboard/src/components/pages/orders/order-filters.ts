import type { FulfillmentStatus } from "@gwprint/db";

import { PROCESSING } from "@/modules/fulfillment/orders/status";

/**
 * ONE list of the URL params that narrow the orders list — and the only place
 * that list is allowed to exist.
 *
 * It exists because "Clear filters" did not clear the filters. The predicate
 * was `Boolean(params.get("q") || status)` and the clear call was
 * `clearFilters(["q", "status"])`, so `tab`, the warehouse and the date window
 * neither lit the button up nor were removed by it: the operator pressed Clear,
 * the list stayed filtered, and nothing on screen explained why. Two hand-kept
 * lists in two expressions is a bug that re-appears every time a filter is
 * added, so both the predicate and the clear now read this array and a new
 * filter cannot fall out of step without being added here first.
 *
 * A plain `.ts` module, not a component: `orders-header.tsx` needs `tab`,
 * `orders-table.tsx` needs all of them, `saved-views.tsx` needs the wider view
 * set, and the page needs the reading conventions. Anything that lived in
 * orders-table.tsx would drag that 900-line client component into the header's
 * chunk for the sake of one array.
 */

/**
 * WAREHOUSE AND SELLER ARE TWO DIFFERENT PARAMS, and one of them used to be
 * misnamed.
 *
 * `?customer=` was read by the page as `warehouseId` — the SITE, not the
 * account. The two columns beside each other make that unreadable: "Seller"
 * renders `customerName` (a User) and "Site" renders `warehouseCode` (a
 * Warehouse), so a param called `customer` that filtered by warehouse was
 * guaranteed to be mis-wired by the next person to touch it. Fixed
 * deliberately rather than left alone, because this task adds the SECOND of
 * the pair: `listOrders` accepts `customerId` as well, and shipping a
 * `?customer=` that means warehouse next to a seller filter that means
 * customer would have been indefensible.
 *
 *   ?site=<warehouseId:number>   → OrderListQuery.warehouseId
 *   ?seller=<customerId:string>  → OrderListQuery.customerId
 *
 * `customer` stays in the list as a READ-ONLY legacy alias so a bookmark or a
 * pasted link made before the rename still lands on the same rows and is still
 * cleared by Clear. Nothing writes it any more.
 */
export const WAREHOUSE_PARAM = "site";
export const LEGACY_WAREHOUSE_PARAM = "customer";
export const SELLER_PARAM = "seller";

/**
 * Every param that narrows which orders come back. Order is the order the
 * cleared-filter set is spoken in; nothing depends on it.
 *
 * `tab` is in here on purpose: the header chips are FILTERS (they carry
 * aria-pressed, they do not navigate), so "Needs attention" is exactly as much
 * a filter as `?status=ON_HOLD` and Clear has to drop it too.
 */
export const ORDER_FILTER_KEYS = [
  "q",
  "status",
  "tab",
  WAREHOUSE_PARAM,
  LEGACY_WAREHOUSE_PARAM,
  SELLER_PARAM,
  "from",
  "to",
] as const;

/**
 * A saved view is the filters PLUS how the list is ordered and drawn — all of
 * it already lives in the URL, which is what makes named views nearly free.
 *
 * `page` is deliberately absent: a view is a question, not a position in the
 * answer, and restoring someone to page 7 of a list they have not seen yet is
 * never what they meant.
 */
export const ORDER_VIEW_KEYS = [
  ...ORDER_FILTER_KEYS,
  "sort",
  "dir",
  "size",
  "density",
] as const;

/** True when anything at all is narrowing the list. */
export function hasOrderFilters(read: (key: string) => string | null): boolean {
  return ORDER_FILTER_KEYS.some((key) => Boolean(read(key)));
}

/**
 * `YYYY-MM-DD` → a date at LOCAL midnight, which is the one thing `new Date()`
 * will not give you.
 *
 * `new Date("2026-09-07")` is parsed as UTC midnight by spec, and the calendar
 * renders in local time — so west of Greenwich the picker would open on the 6th
 * after the user had picked the 7th, and every round trip through the control
 * would walk the range one day backwards. Building the date from its parts
 * keeps the day the user clicked the day the control shows.
 *
 * The SERVER reads the same string as a UTC instant (page.tsx), and that
 * asymmetry is intended: the param names a calendar DAY, the browser shows it
 * as that day's local box, and the query bounds it as that day in UTC — the
 * same UTC-both-sides convention `order-deadline.tsx` uses for the deadline
 * column, so the two columns cannot disagree about which day an order is in.
 */
/** `YYYY-MM-DD` and nothing else — the shape formatDayParam writes. */
const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDayParam(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** The inverse: a local Date → the `YYYY-MM-DD` the URL carries. */
export function formatDayParam(date: Date | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * WHICH STATUSES EACH HEADER CHIP MEANS — the one copy of that map.
 *
 * It lived twice: `TABS` in orders/page.tsx (what the list is actually
 * filtered by) and `TAB_STATUSES` in orders-header.tsx (what the chip counts).
 * Two copies of a filter is the bug this whole module exists to prevent, and
 * it had already produced one: the select-all action rebuilt the server filter
 * by hand from `?q`/`?status`/`?site`/`?seller`/`?from`/`?to` and simply never
 * looked at `?tab`, so "Select all 30 matching" on Needs attention selected
 * two thousand orders in every status instead.
 *
 * `all` is the ABSENCE of a status filter, not a status set — the same URL
 * contract the chips write (`x === "all" ? "" : x`).
 *
 * PROCESSING comes from status.ts DIRECTLY rather than through the domain
 * index: status.ts is pure data behind a type-only import, whereas the index
 * would drag the order service (and Prisma, and the pg driver) into every
 * client bundle that reads a filter.
 */
export const TAB_STATUSES: Record<string, readonly FulfillmentStatus[] | undefined> = {
  all: undefined,
  processing: PROCESSING,
  attention: ["ON_HOLD"],
};

/**
 * The end of a `YYYY-MM-DD` day, as an instant.
 *
 * `?to=` names a calendar DAY and `new Date("2026-09-07")` is that day's
 * MIDNIGHT, so an unbounded `to` excludes the whole day the operator asked
 * for — picking "7 Sep – 7 Sep" would return nothing. Exported as a suffix
 * rather than a Date because the filter crosses the wire as the string the URL
 * holds (see OrderSelectionFilter): the server parses it, so a mistyped
 * `?to=` is ignored instead of arriving as an Invalid Date and 500-ing.
 */
export const DAY_END_SUFFIX = "T23:59:59.999Z";

/**
 * THE FILTER, READ FROM THE URL — once, for both sides of the screen.
 *
 * The page builds the list's filter and the table builds select-all's, and
 * they were built by two different hand-written expressions that disagreed on
 * three axes: the table's never read `?tab=`, never read the legacy
 * `?customer=` warehouse alias, and sent `?to=` as a bare day where the page
 * bounded it at the last instant of that day. Each disagreement makes
 * DataTable's strip state a number ("Select all 46 matching") that the
 * resulting selection does not match — over Delete, Refund and Assign.
 *
 * So both now read this. A filter added to ORDER_FILTER_KEYS and not handled
 * here is still a bug, but it is one bug in one function rather than a silent
 * divergence between two files.
 *
 * The shape is `OrderSelectionFilter` (service/reads.ts) exactly: dates stay
 * STRINGS and are parsed server-side, and the page parses the same strings
 * with the same `parseDateParam` before handing them to `listOrders`.
 */
export type OrderUrlFilter = {
  search?: string;
  status?: FulfillmentStatus[];
  warehouseId?: number;
  customerId?: string;
  from?: string;
  to?: string;
};

export function readOrderFilter(
  read: (key: string) => string | null | undefined,
): OrderUrlFilter {
  // An explicit `?status=` beats the tab's canned set — it is the more
  // specific thing the user just asked for. An unknown tab is no status
  // filter at all rather than a throw: `?tab=` can come from a stale bookmark.
  const status = (read("status") || undefined) as FulfillmentStatus | undefined;
  const tabStatuses = TAB_STATUSES[read("tab") || "all"];
  const to = read("to");

  return {
    search: read("q") || undefined,
    status: status ? [status] : tabStatuses ? [...tabStatuses] : undefined,
    // `?customer=` is the pre-rename spelling of `?site=`, kept readable so a
    // bookmark made before the rename lands on the same rows — see the param
    // comment above. Reading only the new name here is how select-all crossed
    // sites on any such bookmark.
    warehouseId: Number(read(WAREHOUSE_PARAM) || read(LEGACY_WAREHOUSE_PARAM)) || undefined,
    customerId: read(SELLER_PARAM) || undefined,
    from: read("from") || undefined,
    // The day-end bound is appended only to something that IS a bare day.
    // `formatDayParam` is the only writer of this param, but a hand-edited or
    // pre-rename URL is not, and gluing a suffix onto a value that already has
    // a time would turn a real filter into an unparseable one — which the
    // server correctly ignores, i.e. it would WIDEN the selection.
    to: to ? (BARE_DAY.test(to) ? `${to}${DAY_END_SUFFIX}` : to) : undefined,
  };
}
