/**
 * The two reads behind /inventory: the stock table with its tiles, and the
 * movements ledger.
 *
 * Both are site-scoped at the query, not filtered afterwards — a list that
 * fetches everything and hides rows in the component has already sent them.
 */
import { prisma, Prisma } from "@opcreative/db";

import { availableOf } from "../counters.ts";
import type { MovementType } from "./ledger.ts";
import { COUNTERS } from "./rows.ts";
import { readableSites, siteWhere, type Actor } from "./scope.ts";

export type StockFilter = {
  itemType: "MATERIAL" | "PRODUCT";
  search?: string;
  warehouseId?: number;
  page?: number;
  pageSize?: number;
};

export type StockRow = {
  itemType: "MATERIAL" | "PRODUCT";
  itemId: number;
  sku: string;
  name: string;
  /** Material type, or the variant name for a SKU — the table's second row. */
  kind: string | null;
  uom: string | null;
  onHand: number;
  reserved: number;
  needed: number;
  bad: number;
  available: number;
  warehouses: { id: number; name: string; quantity: number }[];
};

/**
 * The stock table plus its tiles.
 *
 * Tile totals are computed SERVER-SIDE over the whole filter, never by summing
 * the rows on screen. The legacy page summed the visible page, so the moment a
 * filter matched more than one page of items the headline numbers were wrong —
 * and quietly wrong, which is worse than blank.
 */
export async function listStock(actor: Actor, filter: StockFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
  const sites = await readableSites(actor, filter.warehouseId);
  const scope = siteWhere(sites);
  const skip = (page - 1) * pageSize;
  const like = filter.search ? { contains: filter.search, mode: "insensitive" as const } : undefined;

  if (filter.itemType === "MATERIAL") {
    const where: Prisma.MaterialWhereInput = {
      deletedAt: null,
      ...(like ? { OR: [{ sku: like }, { name: like }] } : {}),
    };
    const [items, total, sums] = await Promise.all([
      prisma.material.findMany({
        where,
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          uom: true,
          stockRows: {
            where: scope,
            select: { ...COUNTERS, customer: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.material.count({ where }),
      prisma.materialStock.aggregate({
        where: { ...scope, material: where },
        _sum: { quantity: true, reserved: true, needed: true, badQuantity: true },
      }),
    ]);

    return {
      total,
      totals: toTotals(sums._sum),
      rows: items.map((m) =>
        toRow(
          { itemType: "MATERIAL", itemId: m.id, sku: m.sku, name: m.name, kind: m.type, uom: m.uom },
          m.stockRows,
        ),
      ),
    };
  }

  const where: Prisma.ProductVariantWhereInput = {
    deletedAt: null,
    ...(like ? { OR: [{ sku: like }, { variant: { name: like } }, { product: { name: like } }] } : {}),
  };
  const [items, total, sums] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      select: {
        id: true,
        sku: true,
        variant: { select: { name: true } },
        product: { select: { name: true } },
        inventory: {
          where: scope,
          select: { ...COUNTERS, customer: { select: { id: true, name: true } } },
        },
      },
      orderBy: { id: "asc" },
      skip,
      take: pageSize,
    }),
    prisma.productVariant.count({ where }),
    prisma.warehouseInventory.aggregate({
      where: { ...scope, productVariant: where },
      _sum: { quantity: true, reserved: true, needed: true, badQuantity: true },
    }),
  ]);

  return {
    total,
    totals: toTotals(sums._sum),
    rows: items.map((v) =>
      toRow(
        {
          itemType: "PRODUCT",
          itemId: v.id,
          sku: v.sku ?? `#${v.id}`,
          name: `${v.variant.name} · ${v.product.name}`,
          kind: v.variant.name,
          uom: null,
        },
        v.inventory,
      ),
    ),
  };
}

type RawCounters = { quantity: number; reserved: number; needed: number; badQuantity: number };

function toRow(
  item: Omit<StockRow, "onHand" | "reserved" | "needed" | "bad" | "available" | "warehouses">,
  rows: (RawCounters & { customer: { id: number; name: string } })[],
): StockRow {
  const sum = rows.reduce(
    (a, r) => ({
      quantity: a.quantity + r.quantity,
      reserved: a.reserved + r.reserved,
      needed: a.needed + r.needed,
      badQuantity: a.badQuantity + r.badQuantity,
    }),
    { quantity: 0, reserved: 0, needed: 0, badQuantity: 0 },
  );
  return {
    ...item,
    onHand: sum.quantity,
    reserved: sum.reserved,
    needed: sum.needed,
    bad: sum.badQuantity,
    available: availableOf(sum),
    warehouses: rows.map((r) => ({
      id: r.customer.id,
      name: r.customer.name,
      quantity: r.quantity,
    })),
  };
}

function toTotals(sum: Partial<Record<keyof RawCounters, number | null>>) {
  const counters = {
    quantity: sum.quantity ?? 0,
    reserved: sum.reserved ?? 0,
    needed: sum.needed ?? 0,
  };
  return { ...counters, bad: sum.badQuantity ?? 0, available: availableOf(counters) };
}

export type MovementFilter = {
  itemType?: "MATERIAL" | "PRODUCT";
  search?: string;
  type?: MovementType;
  warehouseId?: number;
  /** Last id of the previous page. The ledger only grows, so it is paged by
   * cursor: OFFSET 40000 re-scans every earlier column to answer one page. */
  cursor?: string;
  limit?: number;
};

export async function listMovements(actor: Actor, filter: MovementFilter = {}) {
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
  const sites = await readableSites(actor, filter.warehouseId);
  const like = filter.search ? { contains: filter.search, mode: "insensitive" as const } : undefined;

  const rows = await prisma.inventoryMovement.findMany({
    where: {
      ...siteWhere(sites),
      ...(filter.itemType ? { itemType: filter.itemType } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(like
        ? {
            OR: [
              { material: { OR: [{ sku: like }, { name: like }] } },
              { productVariant: { OR: [{ sku: like }, { variant: { name: like } }] } },
            ],
          }
        : {}),
      ...(filter.cursor ? { id: { lt: BigInt(filter.cursor) } } : {}),
    },
    select: {
      id: true,
      itemType: true,
      type: true,
      quantity: true,
      note: true,
      referenceType: true,
      referenceId: true,
      orderId: true,
      createdAt: true,
      material: { select: { id: true, sku: true, name: true } },
      productVariant: {
        select: {
          id: true,
          sku: true,
          variant: { select: { name: true } },
          product: { select: { name: true } },
        },
      },
      customer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { id: "desc" },
    take: limit + 1, // one extra column is how we know there IS a next page
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    nextCursor: hasMore ? String(page[page.length - 1]!.id) : null,
    rows: page.map((m) => ({
      id: String(m.id),
      itemType: m.itemType,
      type: m.type,
      quantity: m.quantity,
      note: m.note,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      orderId: m.orderId,
      createdAt: m.createdAt,
      customer: m.customer,
      user: m.createdBy ? (m.createdBy.name ?? m.createdBy.email) : null,
      sku: m.material?.sku ?? m.productVariant?.sku ?? null,
      name:
        m.material?.name ??
        (m.productVariant
          ? `${m.productVariant.variant.name} · ${m.productVariant.product.name}`
          : null),
    })),
  };
}
