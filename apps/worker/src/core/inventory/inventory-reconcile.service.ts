/**
 * `InventoryMovement` is the append-only ledger of every onHand/reserved
 * change ever made to a (facility, inventoryItem) pair; `InventoryBalance`
 * is the mutable current-state cache the reservation/consumption services
 * update in the same transaction as each movement row. In a correct system
 * the two always agree: summing every movement's deltas for a pair equals
 * that pair's current balance. This recomputes the expected balance from
 * the ledger and compares it to the live row, catching drift from a bug, a
 * hand-edited row, or a migration gap rather than trusting the cache blindly.
 */
import { prisma, Prisma, type PrismaClient } from "@fulfillflow/db";
import { openException } from "@fulfillflow/core";

export type ReconcileResult = {
  facilityId: string;
  inventoryItemId: string;
  expectedOnHand: Prisma.Decimal;
  expectedReserved: Prisma.Decimal;
  actualOnHand: Prisma.Decimal;
  actualReserved: Prisma.Decimal;
  drift: boolean;
};

const ZERO = new Prisma.Decimal(0);

type DriftSubject = { organizationId: string; fulfillmentId: string; orderId: string };

/**
 * `ExceptionCase` requires a concrete subject — one of ingestionRecordId/
 * orderId/fulfillmentId/shipmentId, or a `store:%` subjectKey (`exception_has_subject`,
 * ADR-07) — and Facility/InventoryItem are global, not tenant-scoped, so
 * neither gives one on its own. This borrows both the tenant and the
 * concrete subject from whichever Fulfillment most recently moved this
 * pair. No such movement ever recorded (a receipt-only item, or a still-
 * empty ledger) means there is nothing to attach an exception to — the
 * drift is still logged structurally, just without a merchant-visible record.
 */
async function resolveSubject(db: PrismaClient, facilityId: string, inventoryItemId: string): Promise<DriftSubject | null> {
  const movement = await db.inventoryMovement.findFirst({
    where: { facilityId, inventoryItemId, fulfillmentId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { fulfillmentId: true, fulfillment: { select: { orderId: true, order: { select: { organizationId: true } } } } },
  });
  if (!movement?.fulfillmentId || !movement.fulfillment) return null;
  return { organizationId: movement.fulfillment.order.organizationId, fulfillmentId: movement.fulfillmentId, orderId: movement.fulfillment.orderId };
}

export async function reconcileBalance(facilityId: string, inventoryItemId: string, db: PrismaClient = prisma): Promise<ReconcileResult> {
  const [sums, balance] = await Promise.all([
    db.inventoryMovement.aggregate({ where: { facilityId, inventoryItemId }, _sum: { onHandDelta: true, reservedDelta: true } }),
    db.inventoryBalance.findUnique({ where: { facilityId_inventoryItemId: { facilityId, inventoryItemId } } }),
  ]);
  const expectedOnHand = sums._sum.onHandDelta ?? ZERO;
  const expectedReserved = sums._sum.reservedDelta ?? ZERO;
  const actualOnHand = balance?.onHand ?? ZERO;
  const actualReserved = balance?.reserved ?? ZERO;
  const drift = !expectedOnHand.equals(actualOnHand) || !expectedReserved.equals(actualReserved);
  const subjectKey = `inventory:${facilityId}:${inventoryItemId}`;

  if (drift) {
    console.error(JSON.stringify({
      msg: "inventory ledger drift detected", facilityId, inventoryItemId,
      expectedOnHand: expectedOnHand.toString(), actualOnHand: actualOnHand.toString(),
      expectedReserved: expectedReserved.toString(), actualReserved: actualReserved.toString(),
    }));
    const subject = await resolveSubject(db, facilityId, inventoryItemId);
    if (subject) {
      await db.$transaction((tx) => openException(tx, {
        organizationId: subject.organizationId, code: "LEDGER_DRIFT", visibility: "INTERNAL", subjectKey,
        fulfillmentId: subject.fulfillmentId, orderId: subject.orderId,
        message: `Inventory ledger drift for facility ${facilityId} / item ${inventoryItemId}`,
        details: {
          expectedOnHand: expectedOnHand.toString(), actualOnHand: actualOnHand.toString(),
          expectedReserved: expectedReserved.toString(), actualReserved: actualReserved.toString(),
        },
      }));
    }
  } else {
    // Balance is back in agreement: resolve any exception still open from a past drift so it doesn't linger.
    await db.exceptionCase.updateMany({
      where: { subjectKey, code: "LEDGER_DRIFT", status: "OPEN" },
      data: { status: "RESOLVED", resolutionAction: "RETRY", resolvedAt: new Date() },
    });
  }

  return { facilityId, inventoryItemId, expectedOnHand, expectedReserved, actualOnHand, actualReserved, drift };
}

export async function reconcileAllBalances(db: PrismaClient = prisma): Promise<ReconcileResult[]> {
  const pairs = await db.inventoryBalance.findMany({ select: { facilityId: true, inventoryItemId: true } });
  const results: ReconcileResult[] = [];
  for (const pair of pairs) results.push(await reconcileBalance(pair.facilityId, pair.inventoryItemId, db));
  return results;
}

export class InventoryReconcileScheduler {
  constructor(private readonly pollMs: number) {}

  async tick(): Promise<ReconcileResult[]> {
    return reconcileAllBalances();
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try { await this.tick(); } catch (err) { console.error(JSON.stringify({ msg: "inventory reconcile tick failed", err: String(err) })); }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.pollMs);
        signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  }
}
