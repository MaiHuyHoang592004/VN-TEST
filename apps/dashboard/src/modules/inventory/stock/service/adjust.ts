/**
 * The two manual acts: correcting a count, and booking in stock that arrived
 * without a receipt.
 *
 * Both write the count, its movement and its audit column inside ONE transaction.
 * A count without its movement is a number nobody can account for, and the
 * legacy system produced them routinely because the two writes were separate
 * calls.
 */
import { prisma, writeAudit, type AuditContext } from "@opcreative/db";

import { adjustStockSchema, quickImportSchema } from "../schema.ts";
import { resolveNeeded, writeMovement } from "./ledger.ts";
import { addToOnHand, assertItemExists, readStock, type ItemRef } from "./rows.ts";
import { assertSite, type Actor } from "./scope.ts";

/** Stable audit target for a count: "MATERIAL:41@2" reads as one shelf. */
const stockTarget = (ref: ItemRef, warehouseId: number) =>
  `${ref.itemType}:${ref.itemId}@${warehouseId}`;

/**
 * Correct a count by hand. The sign of `quantityDelta` IS the direction — the
 * legacy modal had one signed field and no +/- toggle, and the floor knows it.
 *
 * A reason is required, because an unexplained count change is exactly what an
 * audit cannot reconstruct afterwards.
 */
export async function adjustStock(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = adjustStockSchema.parse(raw);
  const ref: ItemRef = { itemType: input.itemType, itemId: input.itemId };
  await assertSite(actor, input.warehouseId);
  await assertItemExists(ref);

  return prisma.$transaction(async (tx) => {
    const before = await readStock(tx, ref, input.warehouseId);
    await addToOnHand(tx, ref, input.warehouseId, input.quantityDelta);
    await writeMovement(tx, {
      ref,
      warehouseId: input.warehouseId,
      type: "MANUAL_ADJUSTMENT",
      quantity: input.quantityDelta,
      actorId: actor.id,
      note: input.reason,
      referenceType: "manual_adjustment",
    });
    // Adding stock can settle a shortage just as a receipt does.
    if (input.quantityDelta > 0) await resolveNeeded(tx, ref, input.warehouseId, actor.id);

    const after = await readStock(tx, ref, input.warehouseId);
    await writeAudit(tx, ctx, {
      action: "STOCK_ADJUSTED",
      targetType: "stock",
      targetId: stockTarget(ref, input.warehouseId),
      before: { quantity: before?.quantity ?? 0 },
      after: { quantity: after?.quantity ?? 0, delta: input.quantityDelta },
      reason: input.reason,
    });

    return { ok: true as const, quantity: after?.quantity ?? 0 };
  });
}

/**
 * Book in stock that arrived without a receipt — the legacy "Import stock"
 * modal, which was a FORM and never a CSV upload (verified: no file import
 * exists anywhere in the legacy stock domain).
 *
 * No import-history table: `type = MANUAL_IMPORT` on the ledger IS the
 * history, which is why legacy's PhysicalStockImport is not ported.
 */
export async function quickImport(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = quickImportSchema.parse(raw);
  const ref: ItemRef = { itemType: input.itemType, itemId: input.itemId };
  await assertSite(actor, input.warehouseId);
  await assertItemExists(ref);

  return prisma.$transaction(async (tx) => {
    await addToOnHand(tx, ref, input.warehouseId, input.quantity);
    await writeMovement(tx, {
      ref,
      warehouseId: input.warehouseId,
      type: "MANUAL_IMPORT",
      quantity: input.quantity,
      actorId: actor.id,
      note: input.note,
      referenceType: "manual_import",
      referenceId: input.provider || null,
    });
    await resolveNeeded(tx, ref, input.warehouseId, actor.id);

    const after = await readStock(tx, ref, input.warehouseId);
    await writeAudit(tx, ctx, {
      action: "STOCK_ADJUSTED",
      targetType: "stock",
      targetId: stockTarget(ref, input.warehouseId),
      after: { quantity: after?.quantity ?? 0, imported: input.quantity },
      reason: input.note,
    });

    return { ok: true as const, quantity: after?.quantity ?? 0 };
  });
}
