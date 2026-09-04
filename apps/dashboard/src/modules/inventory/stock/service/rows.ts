/**
 * The stock ROW — the only file that knows a material's counters live in
 * `material_stock` and a finished SKU's live in `warehouse_inventory`.
 *
 * Everything above this file speaks in ItemRef and never names a table, which
 * is what lets one adjust, one receipt flow and one reservation mechanism
 * serve both. When a third item type ever appears, it is added here.
 */
import { prisma, Prisma } from "@gwprint/db";

import { InventoryError } from "./errors.ts";

export type Tx = Prisma.TransactionClient;

/** Which shelf: one id plus the discriminator that says which table it is in. */
export type ItemRef = { itemType: "MATERIAL" | "PRODUCT"; itemId: number };

export const COUNTERS = {
  quantity: true,
  reserved: true,
  needed: true,
  badQuantity: true,
} as const;

/** The item columns of the ledger/reservation tables, from a ref. */
export const itemColumns = (ref: ItemRef) =>
  ref.itemType === "MATERIAL"
    ? { itemType: "MATERIAL" as const, materialId: ref.itemId }
    : { itemType: "PRODUCT" as const, productVariantId: ref.itemId };

/** The same, as a plain WHERE fragment for the stock tables. */
export const itemWhere = (ref: ItemRef) =>
  ref.itemType === "MATERIAL" ? { materialId: ref.itemId } : { productVariantId: ref.itemId };

export async function readStock(tx: Tx, ref: ItemRef, warehouseId: number) {
  return ref.itemType === "MATERIAL"
    ? tx.materialStock.findUnique({
        where: { warehouseId_materialId: { warehouseId, materialId: ref.itemId } },
        select: COUNTERS,
      })
    : tx.warehouseInventory.findUnique({
        where: { warehouseId_productVariantId: { warehouseId, productVariantId: ref.itemId } },
        select: COUNTERS,
      });
}

/**
 * Add to (or subtract from) onHand, atomically and never below zero.
 *
 * A reduction is a conditional UPDATE — `WHERE quantity >= |delta|` — not a
 * read, a check and a write. Under two concurrent adjustments the read-first
 * version lets both pass and lands a negative count; this one has exactly one
 * winner and the loser is told why.
 */
export async function addToOnHand(tx: Tx, ref: ItemRef, warehouseId: number, delta: number) {
  if (delta >= 0) {
    if (ref.itemType === "MATERIAL") {
      await tx.materialStock.upsert({
        where: { warehouseId_materialId: { warehouseId, materialId: ref.itemId } },
        create: { warehouseId, materialId: ref.itemId, quantity: delta },
        update: { quantity: { increment: delta } },
      });
    } else {
      await tx.warehouseInventory.upsert({
        where: { warehouseId_productVariantId: { warehouseId, productVariantId: ref.itemId } },
        create: { warehouseId, productVariantId: ref.itemId, quantity: delta },
        update: { quantity: { increment: delta } },
      });
    }
    return;
  }

  const where = { warehouseId, ...itemWhere(ref), quantity: { gte: -delta } };
  const data = { quantity: { increment: delta } };
  const { count } =
    ref.itemType === "MATERIAL"
      ? await tx.materialStock.updateMany({ where, data })
      : await tx.warehouseInventory.updateMany({ where, data });

  if (count === 0) {
    throw new InventoryError("below-zero", "Cannot reduce inventory below zero.", {
      warehouseId,
      itemId: ref.itemId,
    });
  }
}

export async function addToNeeded(tx: Tx, ref: ItemRef, warehouseId: number, delta: number) {
  const where = { warehouseId, ...itemWhere(ref) };
  const data = { needed: { increment: delta } };
  if (ref.itemType === "MATERIAL") await tx.materialStock.updateMany({ where, data });
  else await tx.warehouseInventory.updateMany({ where, data });
}

/** A count may only be moved for something that exists and is not retired. */
export async function assertItemExists(ref: ItemRef): Promise<void> {
  const found =
    ref.itemType === "MATERIAL"
      ? await prisma.material.findFirst({
          where: { id: ref.itemId, deletedAt: null },
          select: { id: true },
        })
      : await prisma.productVariant.findFirst({
          where: { id: ref.itemId, deletedAt: null },
          select: { id: true },
        });
  if (!found) throw new InventoryError("item-not-found", "That item no longer exists.", ref);
}
