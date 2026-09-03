/**
 * Giving money back for orders that will never be delivered.
 *
 * This lives with ORDERS rather than with the ledger for the same reason
 * assignment does: a refund is an order act that moves money, and only this
 * domain writes an order. finance's seller-facing REQUEST (doc 07 B2) asks this
 * file what an order is worth back, through fulfillment/index.ts — so "what do
 * we owe on this parcel" is computed once and the quote a seller sees is the
 * arithmetic the admin's refund actually performs.
 *
 * What legacy did and this does not: it refunded the base cost only, from its
 * own credit routine, and it recalculated nothing about shipping. Ours pays
 * back what the seller was actually out of pocket — base cost plus every
 * shipment cost — through core/ledger, and cancels the orders in the SAME
 * transaction as the credit.
 */
import {
  prisma,
  writeAudit,
  orderScope,
  Prisma,
  type AuditContext,
} from "@opcreative/db";

import {
  alreadyApplied,
  applyBalanceMove,
  isDuplicateKey,
} from "../../../core/ledger.ts";
import { notify } from "../../../platform/index.ts";
import { applyStatusChange } from "./status-change.ts";
import { type Actor } from "./shared.ts";

/** Why an order cannot be refunded. Codes, not prose — the UI localises them
 * and the request service reuses the same list. */
export type RefundBlock = "not-paid" | "cancelled" | "already-refunded";

export type RefundLine = {
  orderId: number;
  externalId: string | null;
  customerId: string | null;
  baseCost: string;
  shippingCost: string;
  /** baseCost + shippingCost, as a string so no cent is lost crossing the wire. */
  total: string;
  /** Null when refundable; otherwise why not. */
  blocked: RefundBlock | null;
};

export type RefundQuote = {
  lines: RefundLine[];
  /** Σ of the refundable lines only. */
  total: string;
  /** Ids the actor may not see at all — never revealed, only counted. */
  unknown: number;
};

/**
 * Which of these orders have already been paid back.
 *
 * Reads the ledger rather than a flag on the order: the refund transaction IS
 * the record, and a second row would be a second source of truth to keep in
 * step. `array_contains` is a jsonb containment test, so this is one indexed
 * query rather than one per order.
 */
async function refundedOrderIds(
  orderIds: number[],
  status: "COMPLETED" | "PENDING",
): Promise<Set<number>> {
  const rows = await prisma.transaction.findMany({
    where: {
      type: "REFUND",
      status,
      OR: orderIds.map((id) => ({
        metadata: { path: ["orderIds"], array_contains: id },
      })),
    },
    select: { metadata: true },
  });
  const seen = new Set<number>();
  for (const column of rows) {
    const ids = (column.metadata as { orderIds?: unknown } | null)?.orderIds;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === "number") seen.add(id);
  }
  return seen;
}

const decimal = (v: Prisma.Decimal | null | undefined) => v ?? new Prisma.Decimal(0);

/**
 * What these orders are worth back, per order and in total, WITHOUT moving
 * anything. Both the admin's Refund dialog and a seller's refund request read
 * it, so neither can promise a number the other would not honour.
 */
export async function refundQuote(actor: Actor, orderIds: number[]): Promise<RefundQuote> {
  const ids = [...new Set(orderIds)];
  if (!ids.length) return { lines: [], total: "0.00", unknown: 0 };

  const orders = await prisma.order.findMany({
    where: { ...(await orderScope(actor)), id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      externalId: true,
      customerId: true,
      status: true,
      paid: true,
      baseCost: true,
      shipments: { select: { cost: true } },
    },
  });
  const refunded = await refundedOrderIds(
    orders.map((o) => o.id),
    "COMPLETED",
  );

  let total = new Prisma.Decimal(0);
  const lines = orders.map((order) => {
    const shipping = order.shipments.reduce(
      (sum, s) => sum.add(decimal(s.cost)),
      new Prisma.Decimal(0),
    );
    const amount = decimal(order.baseCost).add(shipping);
    // Order of checks is the order a human would ask them in: was it ever
    // charged, is it still live, has it already been paid back.
    const blocked: RefundBlock | null = !order.paid
      ? "not-paid"
      : order.status === "CANCELLED"
        ? "cancelled"
        : refunded.has(order.id)
          ? "already-refunded"
          : null;
    if (!blocked) total = total.add(amount);
    return {
      orderId: order.id,
      externalId: order.externalId,
      customerId: order.customerId,
      baseCost: decimal(order.baseCost).toFixed(2),
      shippingCost: shipping.toFixed(2),
      total: amount.toFixed(2),
      blocked,
    };
  });

  return { lines, total: total.toFixed(2), unknown: ids.length - orders.length };
}

/**
 * Pay the sellers back and cancel their orders.
 *
 * Full refunds only — legacy had no partial, and inventing one here would mean
 * deciding what a half-refunded order's status is. The shape mirrors
 * assignOrders deliberately: one transaction per seller, one ledger move per
 * seller, an idempotency key scoped per seller because Transaction
 * .idempotencyKey is globally unique and one click legitimately produces one
 * credit each.
 *
 * Orders are cancelled through applyStatusChange, not a status write of its
 * own, so a refund releases reserved stock and notifies the seller by exactly
 * the same rules every other cancellation does.
 */
export async function adminRefundOrders(
  actor: Actor,
  input: { orderIds: number[]; idempotencyKey: string; reason?: string },
  ctx: AuditContext,
) {
  const quote = await refundQuote(actor, input.orderIds);
  const refundable = quote.lines.filter((l) => !l.blocked && l.customerId);
  const skipped = quote.lines.length - refundable.length + quote.unknown;
  if (!refundable.length) {
    return { ok: true as const, refunded: 0, skipped, credits: [] };
  }

  const bySeller = new Map<string, RefundLine[]>();
  for (const line of refundable) {
    const sellerId = line.customerId as string;
    bySeller.set(sellerId, [...(bySeller.get(sellerId) ?? []), line]);
  }

  const credits: Array<{ sellerId: string; amount: string; orders: number }> = [];
  let refunded = 0;

  for (const [sellerId, lines] of bySeller) {
    const key = `refund:${input.idempotencyKey}:${sellerId}`;
    if (await alreadyApplied(key)) continue;

    const amount = lines.reduce((sum, l) => sum.add(new Prisma.Decimal(l.total)), new Prisma.Decimal(0));
    const orderIds = lines.map((l) => l.orderId);
    const reason = input.reason?.trim() || `Refunded ${lines.length} order(s)`;

    try {
      const done = await prisma.$transaction(async (tx) => {
        // Re-read INSIDE the transaction and re-check the status: the quote was
        // taken outside it, and an order someone cancelled in between must not
        // be paid back twice by two admins clicking at once.
        const live = await tx.order.findMany({
          where: { id: { in: orderIds }, status: { not: "CANCELLED" }, deletedAt: null },
          select: { id: true, status: true, configs: true, customerId: true, externalId: true },
        });
        if (!live.length) return 0;

        const move = await applyBalanceMove(tx, ctx, {
          userId: sellerId,
          kind: "REFUND",
          amount,
          reason,
          idempotencyKey: key,
          description: `orders:${orderIds.join(",")}`,
        });
        // The order ids travel with the column so "has this been refunded?" is
        // answerable from the ledger alone — see refundedOrderIds.
        await tx.transaction.updateMany({
          where: { idempotencyKey: key },
          data: { metadata: { orderIds, reason } },
        });

        for (const order of live) {
          await applyStatusChange(tx, ctx, order, "CANCELLED", reason);
        }
        await writeAudit(tx, ctx, {
          action: "BALANCE_REFUND",
          targetType: "order",
          targetId: orderIds.join(","),
          after: { sellerId, refunded: amount.toFixed(2), orders: live.length },
          reason,
        });
        // applyBalanceMove deliberately sends nothing (core may not import a
        // domain), so the seller is told here, inside the same transaction.
        await notify(tx, {
          userId: sellerId,
          type: "BALANCE_REFUNDED",
          data: { amount: amount.toFixed(2), balance: move.after.toFixed(2) },
          href: "/profile/billing",
        });
        return live.length;
      });
      if (!done) continue;
      refunded += done;
      credits.push({ sellerId, amount: amount.toFixed(2), orders: done });
    } catch (e) {
      // A racing duplicate of a credit that DID land. Report success — the
      // money moved exactly once, which is what the caller asked for.
      if (isDuplicateKey(e)) continue;
      throw e;
    }
  }

  return { ok: true as const, refunded, skipped, credits };
}
