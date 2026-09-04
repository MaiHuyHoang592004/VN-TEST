
/**
 * Assignment — THE MONEY PATH, and the read-only preview of it.
 *
 * This is the function the legacy system got wrong, and the file is separate
 * from the rest of orders/ for exactly that reason: it should be possible to
 * read every line that can move a seller's balance without scrolling past
 * anything that cannot.
 */
import {
  prisma,
  writeAudit,
  orderScope,
  Prisma,
  type AuditContext,
} from "@gwprint/db";

import {
  applyBalanceMove,
  alreadyApplied,
  isDuplicateKey,
  NegativeBalanceError,
} from "../../../core/ledger.ts";
import { effectivePrice } from "../../../catalog/index.ts";
import {
  InventoryError,
  recordShortage,
  reserveForOrder,
  type InsufficientStockDetail,
} from "../../../inventory/index.ts";
import { notify, notifyMany, warehouseMemberIds } from "../../../platform/index.ts";
import { assignSchema } from "../schema.ts";
import { type Actor } from "./shared.ts";

/**
 * Assign orders to a warehouse and charge their sellers.
 *
 * This is the function the legacy system got wrong, and it is worth being
 * precise about how. It charged inside `orders.forEach(async order => …)`:
 * unawaited, so the loop never waited for anything, and each iteration read a
 * balance and wrote `balance - cost` back with no transaction and no lock.
 * Five orders for one seller all read the SAME starting balance and overwrote
 * each other — the seller was charged for roughly ONE. No ledger column, no
 * audit, no way to notice. Money simply evaporated.
 *
 * Four things make that impossible here:
 *
 *  1. ONE $transaction PER SELLER. Balance, ledger column, order stamps and audit
 *     commit together or not at all. A seller cannot end up charged for orders
 *     that did not move, or with orders assigned that nobody paid for.
 *  2. SELECT … FOR UPDATE. The orders are locked before they are priced, so a
 *     concurrent assign of the same order blocks rather than interleaving.
 *     Idempotency alone would not catch this — two different keys assigning
 *     the same order is a different race from one key submitted twice.
 *  3. ALREADY-ASSIGNED ORDERS ARE DROPPED, not re-charged. Anything past
 *     PENDING has been paid for once already.
 *  4. UNIQUE(idempotencyKey) ON THE LEDGER ROW. A double-clicked Assign, or a
 *     mobile retry, charges exactly once — enforced by the database, not by an
 *     app-level check that would race.
 *
 * The whole batch for a seller is rejected if their balance cannot cover it:
 * a partial assign would leave the operator guessing which half went through.
 */
export async function assignOrders(actor: Actor, raw: unknown, ctx: AuditContext) {
  const { orderIds, warehouseId, idempotencyKey } = assignSchema.parse(raw);

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, code: true },
  });
  if (!warehouse) return { ok: false as const, error: "unknown-customer" as const };

  // Only orders this actor may act on, and only ones still awaiting assignment.
  const candidates = await prisma.order.findMany({
    where: {
      ...(await orderScope(actor)),
      id: { in: orderIds },
      deletedAt: null,
      status: "PENDING",
    },
    select: { id: true, customerId: true },
  });
  const skipped = orderIds.length - candidates.length;
  if (!candidates.length) return { ok: true as const, assigned: 0, skipped, charges: [] };

  // One transaction per seller: their money, their batch, their all-or-nothing.
  const bySeller = new Map<string, number[]>();
  for (const o of candidates) {
    if (!o.customerId) continue;
    bySeller.set(o.customerId, [...(bySeller.get(o.customerId) ?? []), o.id]);
  }

  // Read once, outside the per-seller transactions: the rota does not change
  // mid-assignment, and re-reading it inside each would hold the lock longer
  // for no benefit.
  const warehouseStaff = (await warehouseMemberIds(warehouseId)).filter((u) => u !== actor.id);

  const charges: Array<{ sellerId: string; amount: string; before: string; after: string; orders: number }> = [];
  let assigned = 0;
  for (const [sellerId, ids] of bySeller) {
    // Scoped per seller, because Transaction.idempotencyKey is globally unique
    // and one Assign click legitimately produces one charge per seller.
    const key = `assign:${idempotencyKey}:${sellerId}`;
    if (await alreadyApplied(key)) continue;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Lock the rows before pricing them. `FOR UPDATE` has no Prisma API,
        // and re-checking status inside the lock is what makes a concurrent
        // assign wait and then find nothing to do.
        const locked = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM orders
          WHERE id = ANY(${ids}::int[]) AND status = 'PENDING' AND deleted_at IS NULL
          FOR UPDATE
        `;
        if (!locked.length) return null;
        const lockedIds = locked.map((r) => r.id);

        const [seller, rows] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { id: sellerId }, select: { tier: true } }),
          tx.order.findMany({
            where: { id: { in: lockedIds } },
            select: {
              id: true,
              quantity: true,
              productVariant: {
                select: { salePrice: true, prices: { select: { tier: true, price: true } } },
              },
            },
          }),
        ]);

        // Price every line through catalog's effectivePrice — imported via
        // catalog/index.ts, never reimplemented here. Two pricing rules
        // eventually disagree, and the one that disagrees bills people.
        let total = new Prisma.Decimal(0);
        const lines: Array<{ id: number; cost: Prisma.Decimal }> = [];
        for (const row of rows) {
          if (!row.productVariant) continue;
          const unit = effectivePrice(row.productVariant, seller.tier);
          const cost = unit.mul(row.quantity);
          lines.push({ id: row.id, cost });
          total = total.add(cost);
        }
        if (!lines.length) return null;

        const move = await applyBalanceMove(tx, ctx, {
          userId: sellerId,
          kind: "ORDER_PAYMENT",
          amount: total.negated(),
          reason: `Assigned ${lines.length} order(s) to ${warehouse.code}`,
          idempotencyKey: key,
          description: `orders:${lines.map((l) => l.id).join(",")}`,
        });

        const now = new Date();
        for (const line of lines) {
          await tx.order.update({
            where: { id: line.id },
            data: {
              warehouseId,
              status: "ASSIGNED",
              assignedAt: now,
              baseCost: line.cost,
              paid: true,
            },
          });
        }

        // Hold the stock these orders will consume, in the SAME transaction as
        // the charge — assignment moves money AND stock, and a seller charged
        // for goods that were never reserved is the worst of the two halves to
        // reconcile afterwards. A shortage throws, and everything above rolls
        // back with it. AFTER the updates above, because reserveForOrder reads
        // Order.warehouseId and this is where it gets set.
        //
        // No-op unless INVENTORY_ORDER_FLOW=1, so this line changes nothing
        // until the counts are trusted post-cutover.
        for (const line of lines) {
          await reserveForOrder(tx, line.id, actor.id);
        }
        await writeAudit(tx, ctx, {
          action: "ORDER_ASSIGNED",
          targetType: "order",
          targetId: lines.map((l) => l.id).join(","),
          after: {
            warehouseId,
            sellerId,
            charged: total.toFixed(2),
            balanceAfter: move.after.toFixed(2),
          },
        });
        // Money LEFT their balance without them doing anything — the case that
        // most deserves a notification, and the one legacy never sent. One per
        // seller per batch, not one per order, because the charge is one move.
        await notify(tx, {
          userId: sellerId,
          type: "ORDER_ASSIGNED",
          data: {
            count: String(lines.length),
            amount: total.toFixed(2),
            balance: move.after.toFixed(2),
          },
          href: "/orders",
        });

        // The other half of an assignment: somebody now has to MAKE these.
        // One notification per seller batch, not per order — a 50-order
        // assignment should land as one line in the rota's panel, not fifty.
        // No amount in the payload: what a seller pays is not the floor's
        // business, and the panel renders only what it is given.
        await notifyMany(tx, warehouseStaff, {
          type: "WORK_ASSIGNED",
          data: { count: String(lines.length), warehouse: warehouse.code },
          href: "/orders?tab=processing",
        });
        return { lines: lines.length, total, before: move.before, after: move.after };
      });

      if (!result) continue;
      assigned += result.lines;
      charges.push({
        sellerId,
        amount: result.total.toFixed(2),
        before: result.before.toFixed(2),
        after: result.after.toFixed(2),
        orders: result.lines,
      });
    } catch (e) {
      if (e instanceof NegativeBalanceError) {
        return { ok: false as const, error: "insufficient-balance" as const, sellerId };
      }
      if (e instanceof InventoryError && e.code === "insufficient-stock") {
        const detail = e.detail as InsufficientStockDetail | undefined;
        // Record the backlog on its OWN transaction. The one that just failed
        // took the shortage rows down with it, and "we are 40 buckles short"
        // is precisely the fact the buyer needs to keep — the assignment can
        // be retried, the knowledge of what blocked it cannot be recovered.
        if (detail?.items?.length) {
          await prisma.$transaction((tx) =>
            recordShortage(tx, detail.orderId, detail.items, actor.id),
          );
        }
        return {
          ok: false as const,
          error: "insufficient-stock" as const,
          sellerId,
          // Named, not counted: "not enough stock" sends someone hunting.
          items: detail?.items?.map((i) => ({
            sku: i.sku,
            name: i.name,
            required: i.required,
            available: i.available,
          })),
        };
      }
      // Lost the UNIQUE(idempotencyKey) race — the other attempt did the work.
      if (isDuplicateKey(e)) continue;
      throw e;
    }
  }
  return { ok: true as const, assigned, skipped, charges };
}

/** Soft delete — an order is financial history, so the column survives. */
/**
 * What assigning these orders WOULD cost, per seller, without charging anyone.
 *
 * Prices through the same effectivePrice the charge uses, so the preview and
 * the debit cannot disagree — a preview computed a second way is a preview
 * that eventually lies. Read-only: no transaction, no lock, no writes.
 */
export async function previewAssignment(actor: Actor, orderIds: number[]) {
  const rows = await prisma.order.findMany({
    where: {
      ...(await orderScope(actor)),
      id: { in: orderIds },
      deletedAt: null,
      status: "PENDING",
    },
    select: {
      id: true,
      quantity: true,
      customerId: true,
      customer: { select: { id: true, name: true, email: true, balance: true, tier: true } },
      productVariant: { select: { salePrice: true, prices: { select: { tier: true, price: true } } } },
    },
  });

  const bySeller = new Map<
    string,
    { sellerId: string; name: string; balance: Prisma.Decimal; charge: Prisma.Decimal; orders: number }
  >();
  for (const row of rows) {
    if (!row.customer || !row.productVariant) continue;
    const key = row.customer.id;
    const entry = bySeller.get(key) ?? {
      sellerId: key,
      name: row.customer.name ?? row.customer.email ?? key,
      balance: row.customer.balance,
      charge: new Prisma.Decimal(0),
      orders: 0,
    };
    entry.charge = entry.charge.add(
      effectivePrice(row.productVariant, row.customer.tier).mul(row.quantity),
    );
    entry.orders += 1;
    bySeller.set(key, entry);
  }

  return {
    skipped: orderIds.length - rows.length,
    sellers: [...bySeller.values()].map((s) => ({
      sellerId: s.sellerId,
      name: s.name,
      orders: s.orders,
      charge: s.charge.toFixed(2),
      balanceBefore: s.balance.toFixed(2),
      balanceAfter: s.balance.sub(s.charge).toFixed(2),
      affordable: s.balance.greaterThanOrEqualTo(s.charge),
    })),
  };
}
