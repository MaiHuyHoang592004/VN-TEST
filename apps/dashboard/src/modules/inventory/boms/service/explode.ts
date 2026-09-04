/**
 * Turning "make N of this SKU" into "take these quantities off these shelves".
 *
 * ONE implementation, used by both the preview panel and the reservation that
 * actually moves stock. A preview computed a second way is a preview that
 * eventually lies — the same reasoning that keeps order pricing in
 * effectivePrice.
 */
import { prisma, Prisma } from "@gwprint/db";

import { InventoryError, type ItemRef, type Tx } from "../../stock/service.ts";

export type Requirement = {
  ref: ItemRef;
  /** Rounded UP: you cannot take 2.4 buckles off a shelf. */
  quantity: number;
  /** Null on the finished-goods path, where there is no recipe. */
  bomId: number | null;
  bomLineId: number | null;
  sku: string;
  name: string;
};

/** The ACTIVE recipe for a product, or null when it has none. */
export function activeBomFor(tx: Tx | typeof prisma, productVariantId: number) {
  return tx.bom.findFirst({
    where: { productVariantId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      name: true,
      version: true,
      lines: {
        select: {
          id: true,
          materialId: true,
          componentSku: true,
          componentName: true,
          quantityPerUnit: true,
          wastageRate: true,
          required: true,
          material: { select: { id: true, sku: true, name: true, trackInventory: true } },
        },
      },
    },
  });
}

/**
 * What `quantity` finished units need.
 *
 * With an ACTIVE BOM: every line explodes to ceil(qty × perUnit × (1 + waste)),
 * aggregated per material — one material used by two lines is reserved once,
 * for the total, or two guarded updates race each other over the same column.
 *
 * With no BOM: the finished SKU itself, one for one. That is the finished-goods
 * path, and it is why this system needs no second service for products.
 */
export async function explode(
  tx: Tx | typeof prisma,
  productVariantId: number,
  quantity: number,
): Promise<Requirement[]> {
  const bom = await activeBomFor(tx, productVariantId);

  if (!bom) {
    const product = await tx.productVariant.findUnique({
      where: { id: productVariantId },
      select: { id: true, sku: true, variant: { select: { name: true } } },
    });
    return [
      {
        ref: { itemType: "PRODUCT", itemId: productVariantId },
        quantity,
        bomId: null,
        bomLineId: null,
        sku: product?.sku ?? `#${productVariantId}`,
        name: product?.variant.name ?? "",
      },
    ];
  }

  const byMaterial = new Map<number, Requirement>();
  for (const line of bom.lines) {
    if (line.materialId == null) {
      // An OPTIONAL unmapped line is a note to somebody, not a blocker. A
      // REQUIRED one means the recipe cannot say what to take.
      if (!line.required) continue;
      throw new InventoryError(
        "bom-line-unmapped",
        "This BOM has a required component with no material assigned.",
        { bomId: bom.id, bomLineId: line.id, componentSku: line.componentSku },
      );
    }
    // Untracked suppliers (tape, glue) appear on the recipe but hold no stock.
    if (line.material && !line.material.trackInventory) continue;

    const needed = new Prisma.Decimal(quantity)
      .mul(line.quantityPerUnit)
      .mul(new Prisma.Decimal(1).add(line.wastageRate));
    const rounded = Math.ceil(needed.toNumber());

    const existing = byMaterial.get(line.materialId);
    if (existing) {
      existing.quantity += rounded;
      continue;
    }
    byMaterial.set(line.materialId, {
      ref: { itemType: "MATERIAL", itemId: line.materialId },
      quantity: rounded,
      bomId: bom.id,
      bomLineId: line.id,
      sku: line.material?.sku ?? line.componentSku,
      name: line.material?.name ?? line.componentName ?? line.componentSku,
    });
  }

  return [...byMaterial.values()];
}
