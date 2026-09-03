/**
 * The numbers behind the dashboard home. QUERIES ONLY — nothing here writes.
 *
 * Every function takes an explicit actor and every caller guards on a
 * PERMISSION, because this is the exact shape of the hole legacy shipped:
 * /api/reports/* had no role guard at all, so any signed-in warehouse could
 * pull the all-customers financial report (report.controller.ts). "Signed in"
 * is not a guard, and a hidden menu item is not a guard either — see
 * reports.test.ts, which proves the refusal rather than trusting the nav.
 *
 * Only the numbers the pages actually render are computed. Legacy's unused
 * overview/efficiency/billing endpoints are deliberately not ported: they
 * existed, nothing called them, and reviving dead reports is how you get four
 * definitions of "revenue".
 */
import {
  prisma,
  orderScope,
  Prisma,
  type AuditContext,
  type FulfillmentStatus,
} from "@opcreative/db";

import { countOpenTickets } from "../../support/index.ts";

type Actor = NonNullable<AuditContext["actor"]>;

export type ReportRange = { from?: Date; to?: Date };

/** Orders are counted by when they were PLACED, which is the date a seller
 * means when they say "this month". */
const placedWithin = (range: ReportRange) =>
  range.from || range.to
    ? { placedAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
    : {};

const createdWithin = (range: ReportRange) =>
  range.from || range.to
    ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
    : {};

const zero = () => new Prisma.Decimal(0);
const decimal = (v: Prisma.Decimal | null | undefined) => v ?? zero();

/**
 * Every ACTIVE seller with what they placed and what they paid in, plus the
 * six totals across the top. One groupBy per axis rather than a query per
 * seller — the legacy page issued N+1 and slowed down as the business grew.
 */
export async function adminReport(_actor: Actor, range: ReportRange = {}) {
  const [sellers, orderGroups, topUpGroups, transactionCount] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, status: "ACTIVE", roles: { has: "SELLER" } },
      select: { id: true, name: true, email: true, balance: true, debt: true },
      orderBy: { email: "asc" },
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: { deletedAt: null, ...placedWithin(range) },
      _count: { _all: true },
      _sum: { quantity: true, baseCost: true },
    }),
    prisma.transaction.groupBy({
      by: ["userId"],
      where: { type: "TOPUP", status: "COMPLETED", ...createdWithin(range) },
      _sum: { amount: true },
    }),
    prisma.transaction.count({ where: { status: "COMPLETED", ...createdWithin(range) } }),
  ]);

  const ordersBySeller = new Map(orderGroups.map((g) => [g.customerId, g]));
  const topUpsBySeller = new Map(topUpGroups.map((g) => [g.userId, g._sum.amount ?? zero()]));

  let orders = 0;
  let quantity = 0;
  let baseCost = zero();
  let topup = zero();

  const rows = sellers.map((seller) => {
    const group = ordersBySeller.get(seller.id);
    const sellerOrders = group?._count._all ?? 0;
    const sellerQuantity = group?._sum.quantity ?? 0;
    const sellerBaseCost = decimal(group?._sum.baseCost);
    const sellerTopUp = topUpsBySeller.get(seller.id) ?? zero();

    orders += sellerOrders;
    quantity += sellerQuantity;
    baseCost = baseCost.add(sellerBaseCost);
    topup = topup.add(sellerTopUp);

    return {
      id: seller.id,
      name: seller.name ?? seller.email,
      email: seller.email,
      orders: sellerOrders,
      quantity: sellerQuantity,
      baseCost: sellerBaseCost.toFixed(2),
      topup: sellerTopUp.toFixed(2),
      balance: seller.balance.toFixed(2),
      debt: seller.debt.toFixed(2),
    };
  });

  return {
    rows,
    summary: {
      transactions: transactionCount,
      customers: sellers.length,
      orders,
      quantity,
      baseCost: baseCost.toFixed(2),
      topup: topup.toFixed(2),
    },
  };
}

/**
 * The seller's own numbers. SELF ONLY, deliberately: legacy's endpoint took an
 * optional :id and a warehouse could pass someone else's. There is no id
 * parameter here to abuse — an admin looking at everyone uses adminReport.
 */
export async function sellerReport(actor: Actor, range: ReportRange = {}) {
  const [me, inRange, byStatus, recent, openTickets] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { balance: true, debt: true },
    }),
    prisma.order.aggregate({
      where: { customerId: actor.id, deletedAt: null, ...placedWithin(range) },
      _count: { _all: true },
      _sum: { quantity: true, baseCost: true },
    }),
    // All-time, on purpose: "how many of mine are stuck on hold" is not a
    // question about this month.
    prisma.order.groupBy({
      by: ["status"],
      where: { customerId: actor.id, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.transaction.findMany({
      where: { userId: actor.id },
      select: { id: true, publicId: true, type: true, status: true, amount: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    countOpenTickets(actor),
  ]);

  const statuses = byStatus.map((g) => ({ status: g.status, count: g._count._all }));
  const statusTotal = statuses.reduce((sum, s) => sum + s.count, 0);

  return {
    balance: me.balance.toFixed(2),
    debt: me.debt.toFixed(2),
    orders: inRange._count._all,
    quantity: inRange._sum.quantity ?? 0,
    baseCost: decimal(inRange._sum.baseCost).toFixed(2),
    statuses,
    statusTotal,
    openTickets,
    recent: recent.map((t) => ({
      id: t.id,
      publicId: t.publicId,
      type: t.type,
      status: t.status,
      amount: t.amount.toFixed(2),
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/**
 * What the floor is making, grouped by SKU and by mockup.
 *
 * The scope is spread FIRST, so a customer user sees their sites and nobody
 * else's. Legacy shipped these two as donut charts that never rendered — the
 * widgets read a context the page never supplied — so ours are plain lists,
 * no chart dependency, and actually wired to a query.
 */
export async function warehouseReport(
  actor: Actor,
  range: ReportRange & { warehouseId?: number } = {},
) {
  const where: Prisma.OrderWhereInput = {
    ...(await orderScope(actor)),
    deletedAt: null,
    ...(range.warehouseId ? { warehouseId: range.warehouseId } : {}),
    ...placedWithin(range),
  };

  const [bySku, byMockup, byStatus] = await Promise.all([
    prisma.order.groupBy({
      by: ["productVariantId"],
      where: { ...where, productVariantId: { not: null } },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    prisma.order.groupBy({
      by: ["mockupId"],
      where: { ...where, mockupId: { not: null } },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    prisma.order.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { quantity: true } }),
  ]);

  // Names in one query per axis, not one per column.
  const [variants, mockups] = await Promise.all([
    prisma.productVariant.findMany({
      where: { id: { in: bySku.map((g) => g.productVariantId as number) } },
      select: { id: true, sku: true, variant: { select: { name: true } } },
    }),
    prisma.mockup.findMany({
      where: { id: { in: byMockup.map((g) => g.mockupId as number) } },
      select: { id: true, name: true },
    }),
  ]);
  const variantName = new Map(variants.map((v) => [v.id, v.sku ?? v.variant?.name ?? `#${v.id}`]));
  const mockupName = new Map(mockups.map((m) => [m.id, m.name]));

  const rank = <T extends { _count: { _all: number }; _sum: { quantity: number | null } }>(
    groups: T[],
    label: (g: T) => string,
  ) =>
    groups
      .map((g) => ({ label: label(g), orders: g._count._all, quantity: g._sum.quantity ?? 0 }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

  return {
    bySku: rank(bySku, (g) => variantName.get(g.productVariantId as number) ?? `#${g.productVariantId}`),
    byMockup: rank(byMockup, (g) => mockupName.get(g.mockupId as number) ?? `#${g.mockupId}`),
    byStatus: byStatus.map((g) => ({
      status: g.status as FulfillmentStatus,
      orders: g._count._all,
      quantity: g._sum.quantity ?? 0,
    })),
  };
}
