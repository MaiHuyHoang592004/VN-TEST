/**
 * The tracking group — what every station actually operates on.
 *
 * The unit of work on the floor is not an order, it is a PARCEL: every order
 * sharing one tracking number (or, before a label exists, one external-order
 * prefix). A worker scans one barcode and expects every piece in that box to
 * move together. Legacy agreed, but re-derived the group in five screens with
 * five slightly different definitions; this file is the only definition.
 *
 * Two rules every caller inherits from `rowsFor`:
 *   • orderScope(actor) is spread into EVERY read. A tracking number typed at
 *     a station is client input; it proves nothing about who may touch what it
 *     matches.
 *   • the group is re-read after a write, so what the station renders is what
 *     the database holds, not what the caller hoped it wrote.
 */
import { prisma, orderScope, Prisma, type AuditContext, type FulfillmentStatus } from "@gwprint/db";

import { truncateTracking } from "../schema.ts";

export type Actor = NonNullable<AuditContext["actor"]>;

/** Either identifier names the same parcel: the station has a tracking
 * number, the /orders column action has an order id. */
export type GroupRef = { trackingNumber?: string; orderId?: number };

export const GROUP_SELECT = {
  id: true,
  externalId: true,
  status: true,
  quantity: true,
  filled: true,
  note: true,
  internalNote: true,
  imageUrl: true,
  proofImageUrl: true,
  configs: true,
  customerId: true,
  assignedToId: true,
  basketPositionId: true,
  customer: { select: { id: true, name: true, email: true } },
  variant: { select: { id: true, name: true, key: true } },
  product: { select: { id: true, name: true, key: true } },
  productVariant: { select: { id: true, sku: true } },
  mockup: { select: { id: true, name: true, thumbnail: true } },
  basketPosition: { select: { id: true, name: true, shelfName: true, column: true, row: true } },
  shipments: {
    select: { id: true, trackingNumber: true, labelUrl: true, shippedAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.OrderSelect;

export type GroupRow = Prisma.OrderGetPayload<{ select: typeof GROUP_SELECT }>;

export type TrackingGroup = {
  trackingNumber: string | null;
  externalIdPrefix: string | null;
  customer: { id: string | null; name: string | null };
  isMultiUnit: boolean;
  labelUrl: string | null;
  basket: { name: string } | null;
  orders: Array<{
    id: number;
    externalId: string | null;
    status: FulfillmentStatus;
    wasScanned: boolean;
    quantity: number;
    filled: number;
    variant: string | null;
    product: string | null;
    sku: string | null;
    mockupThumb: string | null;
    designUrl: string | null;
    proofImageUrl: string | null;
    note: string | null;
    internalNote: string | null;
    basket: { name: string } | null;
    labelUrl: string | null;
  }>;
};

/** What a basket slot is called on the shelf. Falls back to its coordinates so
 * an unnamed position is still findable by a human. */
export const basketName = (
  b: { name: string | null; shelfName: string | null; row: number; column: string } | null,
): { name: string } | null =>
  b ? { name: b.name ?? `${b.shelfName ?? ""}${b.row}${b.column}`.trim() } : null;

/** The external-order prefix: everything before the final "-suffix". A
 * marketplace order that split into three rows shares it. */
export const externalIdPrefix = (externalId: string): string =>
  externalId.includes("-") ? externalId.slice(0, externalId.lastIndexOf("-")) : externalId;

/**
 * Shape rows for a station. `wasScanned` is passed in rather than derived,
 * because it describes the state BEFORE the caller's write — see recordScan.
 */
export function toGroup(rows: GroupRow[], wasScanned: Set<number>): TrackingGroup {
  const tracking = rows.map((r) => r.shipments[0]?.trackingNumber).find(Boolean) ?? null;
  const withLabel = rows.map((r) => r.shipments[0]?.labelUrl).find(Boolean) ?? null;
  const holder = rows.find((r) => r.basketPosition) ?? null;
  const first = rows[0];
  return {
    trackingNumber: tracking,
    externalIdPrefix: !tracking && first?.externalId ? externalIdPrefix(first.externalId) : null,
    customer: {
      id: first?.customerId ?? null,
      name: first?.customer?.name ?? first?.customer?.email ?? null,
    },
    isMultiUnit: rows.some((r) => r.quantity > 1),
    labelUrl: withLabel,
    basket: basketName(holder?.basketPosition ?? null),
    orders: rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      status: r.status,
      wasScanned: wasScanned.has(r.id),
      quantity: r.quantity,
      filled: r.filled,
      variant: r.variant?.name ?? null,
      product: r.product?.name ?? null,
      sku: r.productVariant?.sku ?? null,
      mockupThumb: r.mockup?.thumbnail ?? null,
      designUrl: r.imageUrl,
      proofImageUrl: r.proofImageUrl,
      note: r.note,
      internalNote: r.internalNote,
      basket: basketName(r.basketPosition),
      labelUrl: r.shipments[0]?.labelUrl ?? null,
    })),
  };
}

/**
 * Every order in the actor's scope that belongs to the same parcel as `ref`.
 *
 * Tracking is matched case-insensitively with `contains`, because what a gun
 * reads off a label is frequently the tracking number with a carrier prefix
 * glued to it. Callers truncate to the last 22 characters first.
 *
 * // ponytail: legacy used a case-SENSITIVE contains for strings of 22+ and an
 * // insensitive one below that. Insensitive everywhere is the same amount of
 * // code and strictly more forgiving — carriers do not issue two tracking
 * // numbers that differ only in case.
 */
export async function rowsFor(actor: Actor, ref: GroupRef): Promise<GroupRow[]> {
  const scope = await orderScope(actor);

  if (ref.trackingNumber) {
    const value = truncateTracking(ref.trackingNumber);
    return prisma.order.findMany({
      where: {
        ...scope,
        deletedAt: null,
        shipments: { some: { trackingNumber: { contains: value, mode: "insensitive" } } },
      },
      select: GROUP_SELECT,
      orderBy: { id: "asc" },
    });
  }

  // Order-id mode: find the column, then widen to its parcel. A worker scanning
  // the printed QR of ONE piece expects the whole box, not that one piece.
  const seed = await prisma.order.findFirst({
    where: { ...scope, id: ref.orderId, deletedAt: null },
    select: {
      id: true,
      externalId: true,
      shipments: { select: { trackingNumber: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!seed) return [];

  const tracking = seed.shipments[0]?.trackingNumber;
  if (tracking) return rowsFor(actor, { trackingNumber: tracking });

  if (!seed.externalId) {
    return prisma.order.findMany({ where: { ...scope, id: seed.id }, select: GROUP_SELECT });
  }
  return prisma.order.findMany({
    where: {
      ...scope,
      deletedAt: null,
      externalId: { startsWith: externalIdPrefix(seed.externalId) },
    },
    select: GROUP_SELECT,
    orderBy: { id: "asc" },
  });
}

/** How to re-read the same group after a write. */
export const refOf = (rows: GroupRow[]): GroupRef => {
  const tracking = rows.map((r) => r.shipments[0]?.trackingNumber).find(Boolean);
  return tracking ? { trackingNumber: tracking } : { orderId: rows[0].id };
};

/** Read-only lookup, for a page that renders a parcel without touching it. */
export async function getGroup(actor: Actor, ref: GroupRef): Promise<TrackingGroup | null> {
  const rows = await rowsFor(actor, ref);
  return rows.length ? toGroup(rows, new Set()) : null;
}

/**
 * Release the shelf slot a parcel was staged in. The orders KEEP their
 * basketPositionId — where a parcel sat is history worth having when someone
 * asks what went wrong — while the slot itself becomes free for the next one.
 */
export async function freeBasket(tx: Prisma.TransactionClient, rows: GroupRow[]): Promise<void> {
  const ids = [
    ...new Set(rows.map((r) => r.basketPositionId).filter((id): id is number => id !== null)),
  ];
  if (!ids.length) return;
  await tx.basketPosition.updateMany({
    where: { id: { in: ids }, status: "OCCUPIED" },
    data: { status: "AVAILABLE", trackingNumber: null },
  });
}
