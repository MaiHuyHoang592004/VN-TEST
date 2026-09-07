import { can, parseDriveUrl } from "@gwprint/shared";

import { requireUser } from "@/modules/core/guard";
import {
  listOrders,
  orderStatusSummary,
  parseDateParam,
} from "@/modules/fulfillment/orders/queries";
import { listWarehouses } from "@/modules/inventory/warehouses/queries";
import { OrdersTable } from "@/components/pages/orders/orders-table";
import { OrdersHeader } from "@/components/pages/orders/orders-header";
import { readOrderFilter } from "@/components/pages/orders/order-filters";
import { Page } from "@/components/ds";

/**
 * The Drive FOLDER an order's design lives in, or null.
 *
 * Deliberately narrower than `parseDriveUrl`, which also recognises a Drive
 * FILE link: a file is already something an <img> can render, and calling it a
 * folder would send the row down the resolve path for a picture it already has.
 */
const driveFolderId = (url: string | null): string | null => {
  const ref = parseDriveUrl(url);
  return ref?.kind === "folder" ? ref.id : null;
};

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
        rows={rows.map((o) => ({
          id: o.id,
          externalId: o.externalId,
          marketplace: o.marketplace,
          status: o.status,
          quantity: o.quantity,
          filled: o.filled,
          paid: o.paid,
          // Money as a string: Decimal doesn't cross the boundary and a float
          // would lose cents.
          baseCost: o.baseCost?.toFixed(2) ?? null,
          placedAt: o.placedAt.toISOString(),
          deadline: o.deadline?.toISOString() ?? null,
          customerName: o.customer?.name ?? o.customer?.email ?? null,
          // The IDs behind the two names, so the Seller and Site cells can
          // filter to them. Both were already in ORDER_LIST_SELECT — the row
          // simply never carried them, and a display name is not something a
          // query can be narrowed by.
          customerId: o.customer?.id ?? null,
          warehouseCode: o.warehouse?.code ?? null,
          warehouseId: o.warehouse?.id ?? null,
          productName: o.product?.name ?? null,
          variantName: o.variant?.name ?? null,
          sku: o.productVariant?.sku ?? null,
          // The row carries two DIFFERENT pictures, and the shapes differ:
          //   imageUrl        — the DESIGN, a Drive FOLDER (489/489 rows)
          //   mockup.thumbnail— the MOCKUP, an image endpoint (425/425 rows,
          //                     drive.google.com/thumbnail?id=…)
          // Verified against the live database. A folder is not an image, so
          // only the second of these may ever reach an <img>; the first is a
          // link. That is the whole reason this column used to render a broken
          // glyph on every row.
          //
          // The three fields under them are what let the row stop drawing a
          // folder icon for EVERY design. `folderId` says which folder the
          // mockup was resolved out of, `status` remembers a folder already
          // tried and found unreadable, and `designFolderId` is the design's
          // own folder id — equal to the first means the design and the mockup
          // are literally the same picture and the row draws it once.
          //
          // Parsed HERE and not in the browser so the client never re-derives
          // it per render; parseDriveUrl is pure, so it costs a regex per row.
          // Running `npm run db:backfill:mockups` from libs/db resolves every
          // folder in bulk and turns the whole table into the merged case.
          mockupThumbnail: o.mockup?.thumbnail ?? null,
          mockupFolderId: o.mockup?.folderId ?? null,
          mockupStatus: o.mockup?.status ?? null,
          // FOLDER only. parseDriveUrl also recognises a Drive FILE link, and
          // one of those is already something an <img> can be pointed at — it
          // must not be mistaken for a container to resolve.
          designFolderId: driveFolderId(o.imageUrl),
          imageUrl: o.imageUrl,
          proofImageUrl: o.proofImageUrl,
          shipmentId: o.shipments[0]?.id ?? null,
          labelVoided: Boolean(o.shipments[0]?.voidedAt),
          tracking: o.shipments[0]?.trackingNumber ?? null,
          shipTo: [
            o.shippingAddress?.city,
            o.shippingAddress?.state,
            o.shippingAddress?.zip,
            o.shippingAddress?.country,
          ]
            .filter(Boolean)
            .join(", ") || null,
          trackingStatus: o.shipments[0]?.trackingStatus ?? null,
          carrier: o.shipments[0]?.provider ?? null,
          service: o.shipments[0]?.method ?? null,
          labelUrl: o.shipments[0]?.labelUrl ?? null,
          // Decimal → string at the boundary, same as baseCost: a float would
          // lose cents on the way to the client.
          shipCost: o.shipments[0]?.cost?.toFixed(2) ?? null,
          note: o.note,
          internalNote: o.internalNote,
          updatedAt: o.updatedAt.toISOString(),
          productVariantId: o.productVariant?.id ?? null,
          shippingName: o.shippingAddress?.name ?? null,
          shippingCompany: o.shippingAddress?.company ?? null,
          shippingEmail: o.shippingAddress?.email ?? null,
          shippingPhone: o.shippingAddress?.phone ?? null,
          line1: o.shippingAddress?.line1 ?? null,
          line2: o.shippingAddress?.line2 ?? null,
          city: o.shippingAddress?.city ?? null,
          state: o.shippingAddress?.state ?? null,
          zip: o.shippingAddress?.zip ?? null,
          country: o.shippingAddress?.country ?? null,
        }))}
      />
    </Page>
  );
}
