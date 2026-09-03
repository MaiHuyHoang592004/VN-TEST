/**
 * "If I make N of these, what do I need and what is missing?" — the preview
 * panel in the BOM dialog, and the Coverage tab.
 *
 * Read-only: no transaction, no lock, no writes. It explodes through the SAME
 * function reservation uses, so the panel and the reservation cannot disagree.
 */
import { prisma } from "@opcreative/db";

import { availableOf } from "../../stock/counters.ts";
import { InventoryError, readableSites, siteWhere, type Actor } from "../../stock/service.ts";
import { previewSchema } from "../schema.ts";
import { explode } from "./explode.ts";

export type PreviewLine = {
  sku: string;
  name: string;
  required: number;
  available: number;
  shortage: number;
  mappingStatus: "MAPPED" | "UNMAPPED";
};

export async function previewConsumption(actor: Actor, raw: unknown) {
  const input = previewSchema.parse(raw);
  const sites = await readableSites(actor, input.warehouseId);
  const scope = siteWhere(sites);

  let productVariantId = input.productVariantId;
  if (!productVariantId && input.bomId) {
    const bom = await prisma.bom.findFirst({
      where: { id: input.bomId, deletedAt: null },
      select: { productVariantId: true },
    });
    if (!bom) throw new InventoryError("not-found", "That BOM no longer exists.");
    productVariantId = bom.productVariantId;
  }
  if (!productVariantId) throw new InventoryError("not-found", "Nothing to preview.");

  // An unmapped REQUIRED line throws in explode(). The preview is exactly
  // where someone should find that out, so it is surfaced as a line rather
  // than an error page.
  let requirements;
  try {
    requirements = await explode(prisma, productVariantId, input.quantity);
  } catch (e) {
    if (e instanceof InventoryError && e.code === "bom-line-unmapped") {
      const detail = e.detail as { componentSku?: string };
      return {
        lines: [
          {
            sku: detail?.componentSku ?? "—",
            name: "",
            required: 0,
            available: 0,
            shortage: 0,
            mappingStatus: "UNMAPPED" as const,
          },
        ],
        totalShortage: 0,
        blocked: true,
      };
    }
    throw e;
  }

  const lines: PreviewLine[] = await Promise.all(
    requirements.map(async (r) => {
      const rows =
        r.ref.itemType === "MATERIAL"
          ? await prisma.materialStock.findMany({
              where: { materialId: r.ref.itemId, ...scope },
              select: { quantity: true, reserved: true, needed: true },
            })
          : await prisma.warehouseInventory.findMany({
              where: { productVariantId: r.ref.itemId, ...scope },
              select: { quantity: true, reserved: true, needed: true },
            });

      const available = rows.reduce((sum, column) => sum + availableOf(column), 0);
      return {
        sku: r.sku,
        name: r.name,
        required: r.quantity,
        available,
        shortage: Math.max(r.quantity - available, 0),
        mappingStatus: "MAPPED" as const,
      };
    }),
  );

  return {
    lines,
    totalShortage: lines.reduce((n, l) => n + l.shortage, 0),
    blocked: false,
  };
}

/**
 * The Coverage tab: every material that any BOM uses, with how covered it is.
 *
 * Ranked needed → no stock → unmapped → available (legacy sort), because the
 * point of the screen is "what do I have to buy", and a fully-stocked material
 * is the least interesting column on it.
 */
export async function bomCoverage(actor: Actor, filter: { search?: string; warehouseId?: number } = {}) {
  const sites = await readableSites(actor, filter.warehouseId);
  const scope = siteWhere(sites);
  const like = filter.search ? { contains: filter.search, mode: "insensitive" as const } : undefined;

  // Every material named by a live BOM line, mapped or not.
  const lines = await prisma.bomLine.findMany({
    where: {
      bom: { deletedAt: null, status: { in: ["ACTIVE", "DRAFT"] } },
      ...(like ? { OR: [{ componentSku: like }, { material: { name: like } }] } : {}),
    },
    select: {
      materialId: true,
      componentSku: true,
      componentName: true,
      quantityPerUnit: true,
      bomId: true,
      material: {
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          uom: true,
          stockRows: {
            where: scope,
            select: {
              quantity: true,
              reserved: true,
              needed: true,
              warehouse: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  // Group by material — or by componentSku when there is no material, so an
  // unmapped component still gets one row instead of one per BOM that wants it.
  type Row = {
    key: string;
    materialId: number | null;
    sku: string;
    name: string;
    type: string | null;
    uom: string | null;
    quantity: number;
    reserved: number;
    needed: number;
    available: number;
    bomCount: number;
    perUnit: number;
    warehouses: { id: number; name: string; quantity: number }[];
    coverage: "NEEDED" | "NO_STOCK" | "UNMAPPED" | "AVAILABLE";
  };

  const byKey = new Map<string, Row>();
  const bomsSeen = new Map<string, Set<number>>();

  for (const line of lines) {
    const key = line.materialId != null ? `m:${line.materialId}` : `s:${line.componentSku}`;
    if (!bomsSeen.has(key)) bomsSeen.set(key, new Set());
    bomsSeen.get(key)!.add(line.bomId);

    if (byKey.has(key)) continue;

    const stock = line.material?.stockRows ?? [];
    const sum = stock.reduce(
      (a, r) => ({
        quantity: a.quantity + r.quantity,
        reserved: a.reserved + r.reserved,
        needed: a.needed + r.needed,
      }),
      { quantity: 0, reserved: 0, needed: 0 },
    );
    const available = availableOf(sum);

    byKey.set(key, {
      key,
      materialId: line.materialId,
      sku: line.material?.sku ?? line.componentSku,
      name: line.material?.name ?? line.componentName ?? line.componentSku,
      type: line.material?.type ?? null,
      uom: line.material?.uom ?? null,
      ...sum,
      available,
      bomCount: 0,
      perUnit: Number(line.quantityPerUnit),
      warehouses: stock.map((r) => ({
        id: r.warehouse.id,
        name: r.warehouse.name,
        quantity: r.quantity,
      })),
      coverage:
        line.materialId == null
          ? "UNMAPPED"
          : sum.needed > 0
            ? "NEEDED"
            : sum.quantity === 0
              ? "NO_STOCK"
              : "AVAILABLE",
    });
  }

  const RANK = { NEEDED: 0, NO_STOCK: 1, UNMAPPED: 2, AVAILABLE: 3 };
  const rows = [...byKey.values()]
    .map((r) => ({ ...r, bomCount: bomsSeen.get(r.key)?.size ?? 0 }))
    .sort((a, b) => RANK[a.coverage] - RANK[b.coverage] || a.name.localeCompare(b.name));

  return {
    rows,
    tiles: {
      components: rows.length,
      linked: rows.filter((r) => r.materialId != null).length,
      shortage: rows.filter((r) => r.coverage === "NEEDED").length,
      noStock: rows.filter((r) => r.coverage === "NO_STOCK").length,
    },
  };
}
