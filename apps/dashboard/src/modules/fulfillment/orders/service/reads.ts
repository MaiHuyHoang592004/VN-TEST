/**
 * Reading orders — the list, the cursor walk, and one column.
 *
 * Every query here spreads orderScope(actor) FIRST. That single WHERE clause
 * is the only thing keeping one seller out of another's orders (Prisma
 * connects as one database role with rights to everything), so a findMany
 * without it is a data leak, reviewed like a missing await.
 */
import {
  prisma,
  orderScope,
  resolveOrderMockup,
  Prisma,
  type FulfillmentStatus,
} from "@gwprint/db";

import { can } from "@gwprint/shared";

import { editableAt } from "../status.ts";
import {
  ORDER_SORT_KEYS,
  resumeTargetOf,
  type Actor,
  type OrderSortKey,
} from "./shared.ts";

/**
 * The sort whitelist is re-exported from here because this is where the
 * server-side callers of it already are. The list itself lives in shared.ts —
 * see the comment there for why the one module a client component can import
 * owns it, and this one only maps it.
 *
 * A WHITELIST, never the key the URL happens to carry: `?sort=` is caller
 * input, and an orderBy built by interpolating caller input is the same class
 * of mistake as a WHERE built by string concatenation. It would let a stranger
 * name columns and relations this query never offered, and turn a typo into a
 * 500 that reads the schema back to them.
 */
export { ORDER_SORT_KEYS, type OrderSortKey };

/**
 * Each key as the orderBy Prisma wants.
 *
 * Two of them are RELATION walks: the table shows a customer NAME and a
 * warehouse CODE, and neither is a column on Order. That is the other half of
 * why this is a table rather than a key passed straight through — the shape
 * differs per column, so only a map can express it.
 */
const SORT_COLUMNS: Record<
  OrderSortKey,
  (dir: Prisma.SortOrder) => Prisma.OrderOrderByWithRelationInput
> = {
  placedAt: (dir) => ({ placedAt: dir }),
  // `deadline` is null on an order nobody promised a date for, and Postgres
  // sorts nulls FIRST on DESC — so "latest deadline first" would open with
  // every order that has no deadline at all, the exact opposite of what the
  // operator clicked the column to see. Nulls go last in BOTH directions: the
  // rows carrying a date are the ones being asked about.
  deadline: (dir) => ({ deadline: { sort: dir, nulls: "last" } }),
  updatedAt: (dir) => ({ updatedAt: dir }),
  quantity: (dir) => ({ quantity: dir }),
  baseCost: (dir) => ({ baseCost: dir }),
  status: (dir) => ({ status: dir }),
  customerName: (dir) => ({ customer: { name: dir } }),
  warehouseCode: (dir) => ({ warehouse: { code: dir } }),
};

/**
 * The orderBy for the sort a URL asked for, ALWAYS ending in `id desc`.
 *
 * The tiebreaker is not decoration. Offset paging asks Postgres for rows
 * 26–50 of an ordering, and an ordering with ties has no defined order inside
 * a tie: two orders sharing a `placedAt` can come back one way while page 1 is
 * built and the other way while page 2 is, so one row is served twice and its
 * neighbour is never seen at all. Appending a unique column makes the sort
 * total and the paging deterministic — the same reasoning listOrdersCursor
 * uses when it keys off the last id read.
 *
 * An unknown or absent key falls back to the default rather than throwing:
 * `?sort=` comes from a URL somebody may have bookmarked before a column was
 * renamed, and a stale bookmark should render the default sort, not a 500.
 */
export function orderListOrderBy(
  sort?: string,
  dir?: "asc" | "desc",
): Prisma.OrderOrderByWithRelationInput[] {
  const direction: Prisma.SortOrder = dir === "asc" ? "asc" : "desc";
  const key = ORDER_SORT_KEYS.find((k) => k === sort) ?? "placedAt";
  return [SORT_COLUMNS[key](direction), { id: "desc" }];
}

export type OrderListQuery = {
  search?: string;
  status?: FulfillmentStatus[];
  warehouseId?: number;
  customerId?: string;
  /** An explicit set — what the print sheet and the label actions are given.
   * It NARROWS the scope, never widens it: ids the actor may not see simply
   * do not come back, which is why those callers can take ids from a URL. */
  ids?: number[];
  /** The window the table is filtered to, on `placedAt`. Each side is
   * optional, so "everything since March" needs no end date invented for it. */
  from?: Date;
  to?: Date;
  /** One of ORDER_SORT_KEYS; anything else falls back to placedAt desc. */
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/**
 * The FILTER half of a list query: everything deciding WHICH rows, and
 * nothing deciding their order or how many. What the card strip, the
 * select-all action and the list itself all take, so the three cannot drift.
 */
export type OrderFilter = Omit<OrderListQuery, "page" | "pageSize" | "sort" | "dir">;

/**
 * THE where clause for orders — every filtered read of this table builds it
 * here.
 *
 * One builder rather than a copy per caller, because the first line of it is
 * the scope. A second copy of "which rows may this actor see" is exactly how
 * a data leak gets written: someone adds a filter to the list, another caller
 * keeps its own clause, and six months later a third is written from the copy
 * that forgot `orderScope`. It is the argument access/scopes.ts makes for
 * keeping orderScope and orderScopeSql in one file, one level up.
 *
 * THE CALLER'S FILTERS GO UNDER `AND`, AND THAT IS THE WHOLE POINT OF THE
 * SHAPE. They used to be spread beside the scope, and a later spread of the
 * same top-level key REPLACES the earlier one — so `{...orderScope(actor),
 * customerId: query.customerId}` deleted the one clause keeping a seller out
 * of another seller's orders, and `?seller=<someone else>` on /orders returned
 * their rows, their addresses and their costs. It type-checked and it reviewed
 * clean, which is exactly what productScope's own comment in
 * access/scopes.ts says about a bare clause being "silently overwritten by the
 * very key it was protecting". Under AND both survive: Prisma intersects the
 * top-level keys, so a filter NARROWS within the scope and can never widen it.
 * The same rule saves `warehouseId` from customer scope and `ids` from
 * MATCH_NONE, both of which were reachable the same way.
 *
 * `AND` is omitted entirely when there is nothing to put in it, for the same
 * reason the date window is: an empty clause is something Postgres is handed
 * for nothing, and it makes two otherwise identical where-clauses compare
 * unequal.
 */
export async function orderListWhere(
  actor: Actor,
  query: OrderFilter = {},
): Promise<Prisma.OrderWhereInput> {
  const filters: Prisma.OrderWhereInput[] = [
    ...(query.status?.length ? [{ status: { in: query.status } }] : []),
    ...(query.warehouseId ? [{ warehouseId: query.warehouseId }] : []),
    ...(query.customerId ? [{ customerId: query.customerId }] : []),
    ...(query.ids?.length ? [{ id: { in: query.ids } }] : []),
    ...(query.search ? [{ OR: searchClauses(query.search) }] : []),
    // Absent entirely when neither side is given: an empty `{ placedAt: {} }`
    // is a clause Postgres has to be handed for nothing, and it would make two
    // otherwise identical where-clauses differ by an empty object.
    ...(query.from || query.to
      ? [
          {
            placedAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          },
        ]
      : []),
  ];

  return {
    ...(await orderScope(actor)),
    deletedAt: null,
    ...(filters.length ? { AND: filters } : {}),
  };
}

/**
 * A date out of a URL, or undefined.
 *
 * `new Date("last tuesday")` is an Invalid Date, and handing one of those to
 * Prisma is a 500 — so a mistyped or stale `?from=` would take the whole page
 * down instead of rendering it unfiltered. Same rule as the sort whitelist:
 * input that does not parse is input that was not given.
 */
export function parseDateParam(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The orders `actor` may see. The scope is spread FIRST — a seller sees their
 * own, customer staff see their sites, admin/support/designer see all — so
 * the page needs no per-role branches at all.
 */
export async function listOrders(actor: Actor, query: OrderListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));
  const where = await orderListWhere(actor, query);
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: ORDER_LIST_SELECT,
      orderBy: orderListOrderBy(query.sort, query.dir),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

/**
 * The ceiling on "select all matching". Two thousand ids is ~20 KB on the
 * wire and a bulk action a warehouse can still reason about; past that the
 * honest answer is a narrower filter, not a longer array.
 */
export const MAX_SELECTION_IDS = 2000;

/**
 * The filter as the URL carries it — dates still strings.
 *
 * The table's filters live in the query string, so this is the shape the
 * client already has in its hand. It hands them over as-is and the action
 * parses them with parseDateParam, rather than the client building a Date that
 * may be Invalid and crossing the boundary with it.
 */
export type OrderSelectionFilter = {
  search?: string;
  status?: FulfillmentStatus[];
  warehouseId?: number;
  customerId?: string;
  from?: string;
  to?: string;
};

/**
 * Every order id matching a filter — the "select all 46 matching" a header
 * checkbox cannot do, because the page it lives on only knows its own 25 rows.
 *
 * The SAME where builder the list uses, so the selection is the filter: an id
 * can only come back here if the same actor would have reached that row by
 * paging to it.
 *
 * `capped` rather than a silent truncation. When the filter matches more than
 * the ceiling the caller gets the first MAX_SELECTION_IDS and `total` says how
 * many there really were — enough to tell the operator "2000 of 5312 selected"
 * instead of quietly acting on a subset they believe is everything.
 */
export async function listOrderIds(
  actor: Actor,
  query: OrderFilter = {},
): Promise<{ ids: number[]; capped: boolean; total: number }> {
  const where = await orderListWhere(actor, query);
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: { id: true },
      // Deliberately NOT the table's sort: this is a set, the cheapest total
      // order over it is the primary key, and the only thing that matters is
      // that the cap takes a stable slice rather than an arbitrary one.
      orderBy: { id: "desc" },
      take: MAX_SELECTION_IDS,
    }),
    prisma.order.count({ where }),
  ]);
  return { ids: rows.map((r) => r.id), capped: total > rows.length, total };
}

/** Order ID, tracking number, recipient name, or SKU — one search box, four
 * fields, shared by list/cursor/export so "search" means the same thing
 * everywhere it appears. */
export function searchClauses(search: string): Prisma.OrderWhereInput[] {
  const contains = { contains: search, mode: "insensitive" as const };
  return [
    { externalId: contains },
    { shipments: { some: { trackingNumber: contains } } },
    { shippingAddress: { name: contains } },
    { productVariant: { sku: contains } },
  ];
}

const ORDER_LIST_SELECT = {
  id: true,
  externalId: true,
  marketplace: true,
  quantity: true,
  filled: true,
  status: true,
  placedAt: true,
  assignedAt: true,
  deadline: true,
  paid: true,
  baseCost: true,
  note: true,
  internalNote: true,
  imageUrl: true,
  proofImageUrl: true,
  updatedAt: true,
  warehouse: { select: { id: true, code: true, name: true } },
  // Where it is going — the check a packer makes against the box in their
  // hand before trusting the code they just scanned. The extra fields
  // (company/email/phone/line1/line2) are only read back here so the edit
  // dialog has something to pre-fill; the row list itself only renders city/
  // state/zip/country into `shipTo`.
  shippingAddress: {
    select: {
      name: true, company: true, email: true, phone: true,
      line1: true, line2: true, city: true, state: true, zip: true, country: true,
    },
  },
  customer: { select: { id: true, name: true, email: true } },
  variant: { select: { id: true, name: true, key: true } },
  product: { select: { id: true, name: true, key: true } },
  productVariant: { select: { id: true, sku: true } },
  // `url` alongside the thumbnail: the thumbnail is a rendered preview, and
  // "open the artwork" has to go to the file itself, not to a 400px png.
  //
  // `folderId` and `status` are what let the row stop drawing a folder icon
  // for every design, by telling three cases apart:
  //   a) folderId === parseDriveUrl(order.imageUrl)?.id — this mockup WAS
  //      resolved out of the design folder, so the design and the mockup are
  //      the same picture and the row draws ONE thumbnail rather than two
  //      copies of it;
  //   b) folderId === null — a mockup attached by hand through
  //      setOrderArtwork, genuinely a different image from the design folder
  //      and worth its own cell;
  //   c) status === MOCKUP_UNRESOLVED with a null thumbnail — a folder we
  //      cannot read (private, or holding nothing renderable). A folder icon
  //      is the honest answer there, and the stored row is the memo that stops
  //      us asking Drive again on every render.
  // Resolution stays lazy (/api/orders/<id>/thumb) or bulk (the backfill
  // script). Nothing in this query touches the network.
  mockup: {
    select: { id: true, name: true, thumbnail: true, url: true, folderId: true, status: true },
  },
  shipments: {
    select: {
      id: true, trackingNumber: true, trackingStatus: true, provider: true,
      lastScanStatus: true, lastScanDetail: true, lastScanAt: true,
      voidedAt: true, voidReason: true,
      // The row shows the carrier's SERVICE beside its name ("USPS · Ground
      // Advantage"), the label thumbnail as the third image, and the shipping
      // charge under the base cost. All three are columns on Shipment; the row
      // was simply not asking for them.
      method: true, labelUrl: true, cost: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.OrderSelect;

/**
 * Cursor pagination, for the public API.
 *
 * Offset paging (skip/take) is right for a table with numbered pages and wrong
 * for an integration walking the whole list: a new order arriving mid-walk
 * shifts every later column down, so page 2 re-serves a column page 1 already gave
 * and some other column is never seen at all. Keying off the last id read is
 * stable no matter what is inserted while the caller pages.
 */
export async function listOrdersCursor(
  actor: Actor,
  opts: { cursor?: number; limit?: number; status?: FulfillmentStatus[] } = {},
) {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const rows = await prisma.order.findMany({
    where: {
      ...(await orderScope(actor)),
      deletedAt: null,
      ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
      ...(opts.status?.length ? { status: { in: opts.status } } : {}),
    },
    select: ORDER_LIST_SELECT,
    orderBy: { id: "desc" },
    // One extra column answers "is there more?" without a second COUNT query.
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}

/**
 * One order's artwork thumbnail, resolved from its Drive folder on the first
 * ask and stored from then on.
 *
 * Only orders imported before the backfill ran, or created since, ever reach
 * the resolve branch — everything else answers from the mockup row and never
 * touches the network. The scope comes first as everywhere in this file: the
 * id arrives in a URL, so an unscoped read here would let one seller probe
 * another's artwork.
 */
export async function orderArtwork(actor: Actor, id: number) {
  const order = await prisma.order.findFirst({
    where: { ...(await orderScope(actor)), id, deletedAt: null },
    select: { id: true, mockup: { select: { thumbnail: true, url: true } } },
  });
  if (!order) return null;
  if (order.mockup) return order.mockup;

  const mockup = await resolveOrderMockup(id);
  return mockup ? { thumbnail: mockup.thumbnail, url: mockup.url } : null;
}

/** One order, re-read through the scope — an id alone proves nothing. */
export async function getOrder(actor: Actor, id: number) {
  return prisma.order.findFirstOrThrow({
    where: { ...(await orderScope(actor)), id, deletedAt: null },
    select: { ...ORDER_LIST_SELECT, internalNote: true, configs: true },
  });
}

/** What the card strip counts over: the list's filter minus `status` — see
 * orderStatusSummary for why that one is deliberately missing.
 *
 * `customerId` is here because the Seller column is a filter now: without the
 * field, clicking a name narrowed the table to one seller and left the cards
 * (and the header chips they feed) counting the whole platform. */
export type OrderSummaryQuery = {
  warehouseId?: number;
  customerId?: string;
  from?: Date;
  to?: Date;
  search?: string;
};

/**
 * What the detail page may OFFER — the same question updateOrder will answer
 * when the save arrives.
 *
 * Computed from the order the page already read rather than re-queried, and
 * derived from the same `editableAt` table the service and the public API use.
 * A page that decided this on its own would eventually offer a form whose save
 * is refused, which is the worst of both: the work is typed and then thrown
 * away.
 *
 * `reason` distinguishes the two refusals a person needs told apart. `role`
 * means their grants never allowed it — a warehouse packer, say, who can
 * advance an order but not rewrite one. `too-late` means they would have been
 * allowed and the order has moved on. Only the second is worth explaining in
 * terms of the order.
 *
 * NOT SECURITY. updateOrder re-decides on every save; this only keeps the UI
 * from lying about what a press will do.
 */
export function orderEditPolicy(
  actor: Actor,
  order: { status: FulfillmentStatus; configs: Prisma.JsonValue | null },
): { editable: boolean; wide: boolean; reason: null | "role" | "too-late" } {
  const wide = can(actor.roles, "orders.update");
  if (!wide && !can(actor.roles, "orders.update.own")) {
    return { editable: false, wide: false, reason: "role" };
  }
  const inWindow = editableAt(order.status, wide, resumeTargetOf(order.configs));
  return { editable: inWindow, wide, reason: inWindow ? null : "too-late" };
}

/**
 * The card strip above /orders for customer staff: one status, one count, one
 * quantity — plus what is inside each, grouped by variant.
 *
 * A single groupBy over the SAME scope and window the table uses, so a card
 * and the table it sits above can never disagree. Legacy computed this in the
 * browser from the page it had rendered, which meant the counts changed as you
 * paged.
 *
 * That claim used to be only half true. The cards took `from`/`to` and the
 * list did not, and the list took a search the cards did not, each side
 * building its own clause — so a searched or date-filtered table sat under
 * cards counting a different set of orders, which is worse than no cards.
 * Both now call orderListWhere, and the only difference left is the one that
 * has to be there: NO status filter, because these cards ARE the per-status
 * breakdown and narrowing to one status would leave a single card counting
 * itself.
 *
 * The SELLER was the last one to be added, and it was added for the same
 * reason: `?seller=` became a real filter on the table (the Seller cell writes
 * it) at the same moment these rows started feeding the header chips' counts,
 * so an admin clicking a name saw twelve rows under chips still reading five
 * thousand. reads.test.ts asserts the two clauses stay identical.
 */
export async function orderStatusSummary(actor: Actor, query: OrderSummaryQuery = {}) {
  const where = await orderListWhere(actor, {
    warehouseId: query.warehouseId,
    customerId: query.customerId,
    from: query.from,
    to: query.to,
    search: query.search,
  });

  const [byStatus, byProduct] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    // The popover behind a card: which products make up that status.
    prisma.order.groupBy({
      by: ["status", "productId", "productVariantId"],
      where,
      _count: { _all: true },
      _sum: { quantity: true },
    }),
  ]);

  const [products, variants] = await Promise.all([
    prisma.variant.findMany({
      where: { id: { in: byProduct.map((g) => g.productId).filter((id): id is number => id != null) } },
      select: { id: true, name: true },
    }),
    prisma.productVariant.findMany({
      where: {
        id: { in: byProduct.map((g) => g.productVariantId).filter((id): id is number => id != null) },
      },
      select: { id: true, sku: true },
    }),
  ]);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const variantSku = new Map(variants.map((v) => [v.id, v.sku]));

  return byStatus.map((group) => ({
    status: group.status,
    orders: group._count._all,
    quantity: group._sum.quantity ?? 0,
    items: byProduct
      .filter((g) => g.status === group.status)
      .map((g) => ({
        variant: g.productId ? (productName.get(g.productId) ?? `#${g.productId}`) : "—",
        sku: g.productVariantId ? (variantSku.get(g.productVariantId) ?? null) : null,
        orders: g._count._all,
        quantity: g._sum.quantity ?? 0,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8),
  }));
}
