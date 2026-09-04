/**
 * labels — everything that turns an order into a parcel a carrier will accept:
 * downloading the labels a batch already has, and buying the ones it doesn't.
 *
 *   download.ts   fetch + merge + zip (C4)
 *   provider.ts   the carrier interface — KiloShips is impl #1 (C5)
 *   kiloships.ts  that implementation
 *   purchase.ts   grouping, skip rules, and the two entry points
 *
 * This file is the public surface; every function takes an explicit actor and
 * re-reads through their scope, same as the rest of the domain.
 */
import { prisma, orderScope } from "@gwprint/db";

import { buildLabelBundle, MAX_LABELS, type DownloadResult, type LabelSource } from "./download.ts";
import { type Actor } from "../stations/service/group.ts";

export { MAX_LABELS };
export type { DownloadResult };
export { previewLabels, purchaseLabels, labelsEnabled } from "./purchase.ts";
export type { LabelGroupPreview, PurchaseOutcome } from "./purchase.ts";
export { voidLabel, VoidLabelError, type VoidLabelErrorCode } from "./void.ts";

/**
 * Collect the distinct labels behind a set of orders and bundle them.
 *
 * Distinct by URL, not by order: a parcel of six pieces shares one label, and
 * legacy downloading it six times is what made the batch slow enough to need
 * the sleep that then made it time out.
 */
export async function downloadLabels(
  actor: Actor,
  input: { orderIds?: number[]; from?: Date; to?: Date },
): Promise<DownloadResult & { orders: number }> {
  const scope = await orderScope(actor);
  // Defaults to TODAY when no ids are named — the legacy default, and the
  // shape of the question a floor actually asks ("today's labels").
  const from = input.from ?? startOfToday();
  const to = input.to ?? endOfToday();

  const rows = await prisma.order.findMany({
    where: {
      ...scope,
      deletedAt: null,
      ...(input.orderIds?.length
        ? { id: { in: input.orderIds } }
        : { placedAt: { gte: from, lte: to } }),
      shipments: { some: { labelUrl: { not: null }, voidedAt: null } },
    },
    select: {
      id: true,
      externalId: true,
      shipments: {
        select: { labelUrl: true, trackingNumber: true, voidedAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { id: "asc" },
  });

  const seen = new Set<string>();
  const sources: LabelSource[] = [];
  for (const column of rows) {
    const url = column.shipments[0]?.labelUrl;
    // A void label is not one to print, even if it is the most recent
    // shipment row on the order — see voidLabel's doc-comment.
    if (!url || column.shipments[0]?.voidedAt || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      reference: column.shipments[0]?.trackingNumber ?? column.externalId ?? String(column.id),
      url,
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const result = await buildLabelBundle(sources, `labels/labels-${stamp}-${Date.now()}.zip`);
  return { ...result, orders: rows.length };
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};
