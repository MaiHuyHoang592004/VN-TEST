/**
 * Buying labels: what would be bought, and then buying it.
 *
 * TWO ENTRY POINTS, ON PURPOSE. previewLabels answers "what would happen" and
 * touches nothing; purchaseLabels does it. Legacy bought a label automatically
 * on every order-create path, which meant a mistyped address became a paid-for
 * label before anyone saw the order — and the refund for a bought label is a
 * support ticket with a carrier, not a database update.
 *
 * // ponytail: auto-purchase-on-create is NOT ported. Ceiling: a human clicks
 * // once per batch. Upgrade path: a flag on the importer once the grouping
 * // and skip rules have earned trust on real orders.
 */
import {
  prisma,
  writeAudit,
  orderScope,
  Prisma,
  type AuditContext,
} from "@gwprint/db";

import { notifyMany, usersWithPermission, dispatchWebhookMany } from "../../platform/index.ts";
import { notifySellersOfLabel } from "../stations/service/labels.ts";
import { type Actor } from "../stations/service/group.ts";
import { kiloShips } from "./kiloships.ts";
import {
  LabelProviderError,
  type Address,
  type Parcel,
  type PurchasedLabel,
} from "./provider.ts";

/** The feature hides itself when no carrier is configured. */
export const labelsEnabled = (): boolean => Boolean(process.env.KILOSHIPS_API_KEY);

const provider = () => kiloShips;

export type SkipReason =
  | "already-has-label"
  | "mixed-destinations"
  | "missing-address"
  | "missing-dimensions"
  | "not-ready";

export type LabelGroupPreview = {
  key: string;
  orders: Array<{ id: number; externalId: string | null; quantity: number; variant: string | null }>;
  to: Address | null;
  parcels: Parcel[];
  serviceLevel: string;
  willPurchase: boolean;
  skipReason?: SkipReason;
};

export type PurchaseOutcome = {
  purchased: Array<{ key: string; trackingNumber: string; labelUrl: string; cost?: string; orders: number }>;
  skipped: Array<{ key: string; reason: SkipReason }>;
  failed: Array<{ key: string; reason: string }>;
};

type Row = Prisma.OrderGetPayload<{ select: typeof PURCHASE_SELECT }>;

const PURCHASE_SELECT = {
  id: true,
  externalId: true,
  quantity: true,
  status: true,
  customerId: true,
  warehouseId: true,
  shippingAddress: true,
  variant: { select: { id: true, name: true, key: true } },
  product: { select: { id: true, configs: true } },
  productVariant: { select: { sku: true } },
  shipments: {
    select: { id: true, labelUrl: true, trackingNumber: true, voidedAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.OrderSelect;

// ── Parcel dimensions ────────────────────────────────────────────────────────

/**
 * Box size, read from the PRODUCT's configs — never guessed.
 *
 * Legacy's LABEL_CONFIG mapped variant.key → {min, single, multiple}: one box
 * for a single item, a bigger one above a threshold. The rules live as data on
 * the PRODUCT (seed-demo.ts sets `configs.parcel` on `prisma.product`, and the
 * catalog's Product.configs field is exactly this escape hatch) because they
 * are a customer fact, not code — never on Variant, which is the shared
 * color/size catalog entry and carries no per-product box data at all.
 *
 * When a product has no dimensions we report "missing-dimensions" and skip it.
 * Guessing is the one thing that must not happen here: a wrong box size buys a
 * label at the wrong price, the carrier re-rates it weeks later, and the
 * difference lands as an unexplained invoice line.
 */
type BoxRule = { min?: number; length: number; width: number; height: number; weight: number };
type ProductParcelConfig = { single?: BoxRule; multiple?: BoxRule; distanceUnit?: string; massUnit?: string };

export function parcelsFor(rows: Row[]): Parcel[] | null {
  const units = rows.reduce((n, r) => n + r.quantity, 0);
  const config = (rows[0]?.product?.configs as { parcel?: ProductParcelConfig } | null)?.parcel;
  if (!config) return null;

  const rule =
    units > 1 && config.multiple
      ? config.multiple
      : config.single ?? config.multiple;
  if (!rule) return null;

  return [
    {
      length: rule.length,
      width: rule.width,
      height: rule.height,
      distanceUnit: (config.distanceUnit as "in" | "cm") ?? "in",
      // Weight scales with the count; the box does not.
      weight: Number((rule.weight * Math.max(1, units)).toFixed(2)),
      massUnit: (config.massUnit as "lb" | "oz" | "kg" | "g") ?? "oz",
    },
  ];
}

const addressOf = (column: Row): Address | null => {
  const a = column.shippingAddress;
  if (!a || !a.zip) return null;
  return {
    name: a.name ?? "",
    company: a.company,
    line1: a.line1 ?? "",
    line2: a.line2,
    city: a.city ?? "",
    state: a.state,
    zip: a.zip,
    country: a.country ?? "US",
    phone: a.phone,
    email: a.email,
  };
};

/** Two orders ship together only if they go to the SAME doorstep. */
const addressKey = (a: Address | null): string =>
  a ? [a.name, a.line1, a.line2, a.city, a.state, a.zip, a.country].join("|").toLowerCase() : "none";

// ── Grouping and the skip rules ──────────────────────────────────────────────

/**
 * Group orders into parcels and decide which can be bought. Port of legacy's
 * getGroupSkipReason, with the reasons made explicit rather than inferred from
 * a null return.
 */
function planGroups(rows: Row[], allowMultiple: boolean): LabelGroupPreview[] {
  const byDestination = new Map<string, Row[]>();
  for (const column of rows) {
    const key = addressKey(addressOf(column));
    byDestination.set(key, [...(byDestination.get(key) ?? []), column]);
  }

  return [...byDestination.entries()].map(([key, group]) => {
    const to = addressOf(group[0]);
    const parcels = parcelsFor(group);
    const preview: LabelGroupPreview = {
      key,
      orders: group.map((r) => ({
        id: r.id,
        externalId: r.externalId,
        quantity: r.quantity,
        variant: r.variant?.name ?? null,
      })),
      to,
      parcels: parcels ?? [],
      serviceLevel: process.env.KILOSHIPS_SERVICE_LEVEL || "usps_ground_advantage",
      willPurchase: false,
    };

    if (key === "none" || !to) return { ...preview, skipReason: "missing-address" as const };
    // Buying a second label for a parcel that already has a LIVE one is how a
    // carrier ends up with two shipments for one box and the seller with two
    // charges. A voided one does not count — that is precisely what voiding
    // is for: the old label stopped being live, on purpose.
    if (!allowMultiple && group.some((r) => r.shipments[0]?.labelUrl && !r.shipments[0]?.voidedAt)) {
      return { ...preview, skipReason: "already-has-label" as const };
    }
    if (!parcels) return { ...preview, skipReason: "missing-dimensions" as const };
    return { ...preview, willPurchase: true };
  });
}

async function scopedRows(actor: Actor, orderIds: number[]): Promise<Row[]> {
  return prisma.order.findMany({
    where: { ...(await orderScope(actor)), id: { in: orderIds }, deletedAt: null },
    select: PURCHASE_SELECT,
    orderBy: { id: "asc" },
  });
}

/** What WOULD happen. No writes, no provider calls, no money. */
export async function previewLabels(
  actor: Actor,
  orderIds: number[],
  allowMultiple = false,
): Promise<{ groups: LabelGroupPreview[]; selected: number; skippedOrders: number }> {
  const rows = await scopedRows(actor, orderIds);
  const groups = planGroups(rows, allowMultiple);
  return {
    groups,
    selected: rows.length,
    // Ids the actor cannot see never came back — say so rather than silently
    // pretending the selection was smaller.
    skippedOrders: orderIds.length - rows.length,
  };
}

/**
 * Buy them. One provider call per group, one Shipment column per ORDER (a group
 * shares the tracking number, not the column), audit per order, and the seller's
 * bell + webhook after the commit.
 */
export async function purchaseLabels(
  actor: Actor,
  orderIds: number[],
  ctx: AuditContext,
  allowMultiple = false,
): Promise<PurchaseOutcome> {
  if (!labelsEnabled()) {
    throw new LabelProviderError("not-configured", "No label provider is configured.");
  }

  const rows = await scopedRows(actor, orderIds);
  const groups = planGroups(rows, allowMultiple);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const outcome: PurchaseOutcome = { purchased: [], skipped: [], failed: [] };

  for (const group of groups) {
    if (!group.willPurchase) {
      outcome.skipped.push({ key: group.key, reason: group.skipReason ?? "not-ready" });
      continue;
    }

    const groupRows = group.orders.map((o) => byId.get(o.id)!).filter(Boolean);
    // Stable across retries: the same orders always produce the same reference,
    // which is what lets the provider hand back the label it already sold us
    // instead of selling another.
    const referenceId = `opc-${groupRows.map((r) => r.id).sort((a, b) => a - b).join("-")}`;

    let label: PurchasedLabel;
    try {
      label = await provider().purchase({
        referenceId,
        orders: group.orders.map((o) => ({ id: o.id, externalId: o.externalId, quantity: o.quantity })),
        from: warehouseAddress(),
        to: group.to!,
        parcels: group.parcels,
        serviceLevel: group.serviceLevel,
      });
    } catch (e) {
      outcome.failed.push({
        key: group.key,
        reason: e instanceof Error ? e.message : "purchase failed",
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const column of groupRows) {
        await tx.shipment.create({
          data: {
            orderId: column.id,
            trackingNumber: label.trackingNumber,
            labelUrl: label.labelUrl,
            provider: label.provider,
            method: label.method,
            cost: label.cost ? new Prisma.Decimal(label.cost) : null,
            trackingStatus: "CREATED",
            // The raw response IS the dispute record — this is what replaces
            // legacy's whole OrderLabel log table.
            configs: { parcels: group.parcels, referenceId, raw: label.raw } as Prisma.InputJsonValue,
          },
        });
        await writeAudit(tx, ctx, {
          action: "LABEL_PURCHASED",
          targetType: "order",
          targetId: String(column.id),
          after: {
            trackingNumber: label.trackingNumber,
            provider: label.provider,
            cost: label.cost ?? null,
            referenceId,
          },
        });
      }
      await notifySellersOfLabel(tx, groupRows, label.trackingNumber, label.provider, ctx);
    });

    outcome.purchased.push({
      key: group.key,
      trackingNumber: label.trackingNumber,
      labelUrl: label.labelUrl,
      cost: label.cost,
      orders: groupRows.length,
    });

    // After the commit, never inside it.
    await dispatchWebhookMany(
      groupRows.map((r) => r.customerId).filter((id): id is string => id !== null),
      "shipping_added",
      (userId) => ({
        tracking_number: label.trackingNumber,
        label_url: label.labelUrl,
        provider: label.provider,
        orders: groupRows
          .filter((r) => r.customerId === userId)
          .map((r) => ({ id: r.id, order_id: r.externalId })),
        updated_at: new Date().toISOString(),
      }),
    );
    await subscribeIfEnabled(label.trackingNumber);
  }

  // A failed purchase is money that did not move but work that did not happen
  // either — the people who can retry it should not have to be watching.
  if (outcome.failed.length) {
    const watchers = (await usersWithPermission("orders.read.all")).filter(
      (id) => id !== ctx.actor?.id,
    );
    await notifyMany(prisma, [...watchers, ctx.actor?.id ?? ""].filter(Boolean), {
      type: "LABEL_PURCHASE_FAILED",
      data: {
        count: String(outcome.failed.length),
        reason: outcome.failed[0]?.reason ?? "unknown",
      },
      href: "/orders",
    });
  }

  return outcome;
}

/**
 * Where parcels ship FROM.
 *
 * // ponytail: one ship-from address from env, not per-customer. Ceiling: a
 * // second site that ships its own parcels needs its own return address.
 * // Upgrade path: columns on Warehouse and a lookup by order.warehouseId —
 * // the group already knows which site it belongs to.
 */
function warehouseAddress(): Address {
  return {
    name: process.env.SHIP_FROM_NAME || "GWPrint",
    company: process.env.SHIP_FROM_COMPANY || null,
    line1: process.env.SHIP_FROM_LINE1 || "",
    line2: process.env.SHIP_FROM_LINE2 || null,
    city: process.env.SHIP_FROM_CITY || "",
    state: process.env.SHIP_FROM_STATE || null,
    zip: process.env.SHIP_FROM_ZIP || "",
    country: process.env.SHIP_FROM_COUNTRY || "US",
    phone: process.env.SHIP_FROM_PHONE || null,
    email: process.env.SHIP_FROM_EMAIL || null,
  };
}

/** DRX registration, when it is configured. Failure never fails a purchase —
 * the label is bought either way, and tracking is an enhancement. */
async function subscribeIfEnabled(trackingNumber: string): Promise<void> {
  if (!process.env.DRX_API_KEY) return;
  const { subscribeTracking } = await import("../tracking/service.ts");
  await subscribeTracking([trackingNumber]);
}
