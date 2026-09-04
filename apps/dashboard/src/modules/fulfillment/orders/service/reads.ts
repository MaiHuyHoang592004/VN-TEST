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

import { type Actor } from "./shared.ts";

export type OrderListQuery = {
  search?: string;
  status?: FulfillmentStatus[];
  warehouseId?: number;
  customerId?: string;
  /** An explicit set — what the print sheet and the label actions are given.
   * It NARROWS the scope, never widens it: ids the actor may not see simply
   * do not come back, which is why those callers can take ids from a URL. */
  ids?: number[];
  page?: number;
  pageSize?: number;
};

/**
 * The orders `actor` may see. The scope is spread FIRST — a seller sees their
 * own, customer staff see their sites, admin/support/designer see all — so
 * the page needs no per-role branches at all.
 */
export async function listOrders(actor: Actor, query: OrderListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));
  const where: Prisma.OrderWhereInput = {
    ...(await orderScope(actor)),
    deletedAt: null,
    ...(query.status?.length ? { status: { in: query.status } } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.ids?.length ? { id: { in: query.ids } } : {}),
    ...(query.search ? { OR: searchClauses(query.search) } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: ORDER_LIST_SELECT,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return { rows, total, page, pageSize };
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
  mockup: { select: { id: true, name: true, thumbnail: true, url: true } },
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

/**
 * The card strip above /orders for customer staff: one status, one count, one
 * quantity — plus what is inside each, grouped by variant.
 *
 * A single groupBy over the SAME scope and window the table uses, so a card
 * and the table it sits above can never disagree. Legacy computed this in the
 * browser from the page it had rendered, which meant the counts changed as you
 * paged.
 */
export async function orderStatusSummary(
  actor: Actor,
  query: { warehouseId?: number; from?: Date; to?: Date } = {},
) {
  const where: Prisma.OrderWhereInput = {
    ...(await orderScope(actor)),
    deletedAt: null,
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.from || query.to
      ? {
          placedAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

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
