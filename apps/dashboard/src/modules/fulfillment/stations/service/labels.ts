/**
 * Linking a label bought elsewhere — the manual path.
 *
 * Replaces legacy's "PUT /orders/:id with a label_url". In this schema
 * tracking and label live on Shipment and never on Order, so a reship is a
 * second column rather than a field overwritten on top of the first attempt.
 *
 * Buying a label through a carrier (KiloShips) arrives in Phase C, behind a
 * provider interface; it will create the same Shipment rows this does.
 */
import { prisma, writeAudit, orderScope, Prisma, type AuditContext } from "@gwprint/db";

import { dispatchWebhookMany, notify } from "../../../platform/index.ts";
import { type Actor } from "./group.ts";
import { linkLabelSchema, truncateTracking } from "../schema.ts";

/**
 * Tell each seller their parcel has a label. Shared with the label PURCHASE
 * path (C5) so both ways of getting a label ring the same bell — a seller
 * should not be able to tell from their notifications how the label was
 * obtained, because it makes no difference to them.
 */
export async function notifySellersOfLabel(
  tx: Prisma.TransactionClient,
  rows: Array<{ id: number; customerId: string | null; externalId: string | null }>,
  tracking: string,
  provider: string | null,
  ctx: AuditContext,
): Promise<void> {
  const sellers = new Map<string, string>();
  for (const column of rows) {
    if (!column.customerId || column.customerId === ctx.actor?.id) continue;
    if (!sellers.has(column.customerId)) {
      sellers.set(column.customerId, column.externalId ?? String(column.id));
    }
  }
  for (const [userId, externalId] of sellers) {
    await notify(tx, {
      userId,
      type: "SHIPPING_LABEL_READY",
      data: { externalId, tracking, provider: provider ?? "—" },
      href: "/orders",
    });
  }
}

export async function linkLabel(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
): Promise<{ ok: true; linked: number; skipped: number }> {
  const input = linkLabelSchema.parse(raw);
  const scope = await orderScope(actor);
  // Re-read through the scope: the caller sent ids, and ids are not authority.
  const rows = await prisma.order.findMany({
    where: { ...scope, id: { in: input.orderIds }, deletedAt: null },
    select: { id: true, customerId: true, externalId: true },
  });
  if (!rows.length) return { ok: true as const, linked: 0, skipped: input.orderIds.length };

  const tracking = truncateTracking(input.trackingNumber);

  // Already linked to THIS tracking number? Then this is a retry — a floor
  // re-scanning the same label, or an integration replaying its PATCH — and a
  // second shipment column would double the parcel and the label cost. Different
  // tracking on the same order is a legitimate re-ship and still goes through.
  const existing = await prisma.shipment.findMany({
    where: { orderId: { in: rows.map((r) => r.id) }, trackingNumber: tracking },
    select: { orderId: true },
  });
  const alreadyLinked = new Set(existing.map((s) => s.orderId));
  const fresh = rows.filter((column) => !alreadyLinked.has(column.id));
  if (!fresh.length) {
    return {
      ok: true as const,
      linked: rows.length,
      skipped: input.orderIds.length - rows.length,
    };
  }
  await prisma.$transaction(async (tx) => {
    // One bell per SELLER, not per order — a shop with three pieces in one
    // parcel is told once that the parcel has a label. Inside the transaction
    // so the notification cannot outlive a rollback.
    await notifySellersOfLabel(tx, fresh, tracking, input.provider ?? null, ctx);
    for (const column of fresh) {
      await tx.shipment.create({
        data: {
          orderId: column.id,
          trackingNumber: tracking,
          labelUrl: input.labelUrl,
          provider: input.provider ?? null,
          method: input.method ?? null,
          cost: input.cost ? new Prisma.Decimal(input.cost) : null,
        },
      });
      await writeAudit(tx, ctx, {
        action: "SHIPMENT_CREATED",
        targetType: "order",
        targetId: String(column.id),
        after: {
          trackingNumber: tracking,
          labelUrl: input.labelUrl,
          provider: input.provider ?? null,
        },
      });
    }
  });

  // One event per SELLER, not per order: a shop with three pieces in one
  // parcel is told once that the parcel has a label. After the commit, never
  // inside it.
  await dispatchWebhookMany(
    rows.map((r) => r.customerId).filter((id): id is string => id !== null),
    "shipping_added",
    (userId) => ({
      tracking_number: tracking,
      label_url: input.labelUrl,
      provider: input.provider ?? null,
      orders: rows
        .filter((r) => r.customerId === userId)
        .map((r) => ({ id: r.id, order_id: r.externalId })),
      updated_at: new Date().toISOString(),
    }),
  );

  return { ok: true as const, linked: rows.length, skipped: input.orderIds.length - rows.length };
}
