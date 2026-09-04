/**
 * The movements ledger: append one column, and the shortage bookkeeping that
 * reads it back.
 *
 * There is no update and no delete here, and none is exported — the ledger is
 * how a wrong count gets explained months later, and a history you can edit
 * explains nothing. Legacy kept separate import-history tables recording the
 * same events a second time; `type` is the filter that replaces them.
 */
import type { Prisma } from "@gwprint/db";

import { unreservedOf } from "../counters.ts";
import { addToNeeded, itemColumns, readStock, type ItemRef, type Tx } from "./rows.ts";

export type MovementType = Prisma.InventoryMovementCreateManyInput["type"];

export type MovementInput = {
  ref: ItemRef;
  warehouseId: number;
  type: MovementType;
  /** Signed. Negative for movements that take stock away (see counters.ts). */
  quantity: number;
  actorId?: string | null;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  orderId?: number | null;
  reservationId?: number | null;
  bomId?: number | null;
  bomLineId?: number | null;
};

export async function writeMovement(tx: Tx, input: MovementInput) {
  const { ref, actorId, ...rest } = input;
  await tx.inventoryMovement.create({
    data: { ...itemColumns(ref), ...rest, createdById: actorId ?? null },
  });
}

/**
 * Settle the shortage backlog when stock arrives.
 *
 * Called on every path that ADDS units (adjustment up, quick import, receipt).
 * If some of what was promised and missing is now physically here and unheld,
 * `needed` comes down by that much and the ledger says so — which is what
 * makes the shortage tiles self-heal instead of staying red until a human
 * notices (bom.service.ts:752-783).
 *
 * Partial settlement is deliberate, and slightly more eager than the legacy
 * "only when it fully covers" rule: three units arriving against a backlog of
 * five clears three. Under-resolving leaves a shortage that real stock already
 * covers, and `needed` only ever suppresses availability.
 *
 * Settled against UNRESERVED units, not available ones: a backlog is cleared
 * by stock that is actually free, never by units already promised elsewhere.
 */
export async function resolveNeeded(
  tx: Tx,
  ref: ItemRef,
  warehouseId: number,
  actorId?: string | null,
): Promise<number> {
  const column = await readStock(tx, ref, warehouseId);
  if (!column || column.needed <= 0) return 0;

  const settled = Math.min(column.needed, unreservedOf(column));
  if (settled <= 0) return 0;

  await addToNeeded(tx, ref, warehouseId, -settled);
  await writeMovement(tx, {
    ref,
    warehouseId,
    type: "NEEDED_RESOLVED",
    quantity: settled,
    actorId,
    referenceType: "needed_resolved",
  });
  return settled;
}
