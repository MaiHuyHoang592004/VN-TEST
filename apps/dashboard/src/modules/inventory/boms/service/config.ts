/**
 * BOMs as CONFIGURATION: what a SKU is made of, versioned so changing a recipe
 * never rewrites what past orders actually consumed.
 *
 * The rule this file exists to hold: exactly ONE version per product may be
 * ACTIVE. Two would make "what does this order need?" ambiguous at the one
 * moment it must not be — assignment — so every path that activates
 * deactivates its siblings in the same transaction.
 */
import { prisma, writeAudit, Prisma, type AuditContext } from "@opcreative/db";

import { InventoryError, type Actor } from "../../stock/service.ts";
import { bomSchema } from "../schema.ts";

const blankToNull = (v?: string | null) => (v && v.length ? v : null);

/** The four counts every list column and tile is built from. */
const summarize = (lines: { materialId: number | null; required: boolean }[]) => ({
  lineCount: lines.length,
  mappedLineCount: lines.filter((l) => l.materialId != null).length,
  requiredLineCount: lines.filter((l) => l.required).length,
  /** "Incomplete lines" on the page — a line with no material behind it. */
  unmappedLineCount: lines.filter((l) => l.materialId == null).length,
});

export type BomFilter = {
  search?: string;
  status?: "DRAFT" | "ACTIVE" | "INACTIVE";
  productVariantId?: number;
  page?: number;
  pageSize?: number;
};

export async function listBoms(_actor: Actor, filter: BomFilter = {}) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
  const like = filter.search ? { contains: filter.search, mode: "insensitive" as const } : undefined;

  const where: Prisma.BomWhereInput = {
    deletedAt: null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.productVariantId ? { productVariantId: filter.productVariantId } : {}),
    ...(like
      ? {
          OR: [
            { name: like },
            { productVariant: { sku: like } },
            { productVariant: { variant: { name: like } } },
          ],
        }
      : {}),
  };

  const [rows, total, statusCounts, unmapped] = await Promise.all([
    prisma.bom.findMany({
      where,
      select: {
        id: true,
        name: true,
        version: true,
        status: true,
        updatedAt: true,
        productVariant: {
          select: {
            id: true,
            sku: true,
            variant: { select: { name: true } },
            product: { select: { name: true } },
          },
        },
        lines: { select: { materialId: true, required: true } },
      },
      orderBy: [{ productVariantId: "asc" }, { version: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.bom.count({ where }),
    // Tiles are SERVER-side over the whole filter, never summed from the page.
    prisma.bom.groupBy({ by: ["status"], where, _count: true }),
    prisma.bomLine.count({ where: { materialId: null, bom: where } }),
  ]);

  return {
    total,
    tiles: {
      total,
      active: statusCounts.find((s) => s.status === "ACTIVE")?._count ?? 0,
      draft: statusCounts.find((s) => s.status === "DRAFT")?._count ?? 0,
      unmappedLines: unmapped,
    },
    rows: rows.map(({ lines, ...b }) => ({ ...b, summary: summarize(lines) })),
  };
}

export async function getBom(_actor: Actor, id: number) {
  const bom = await prisma.bom.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      version: true,
      status: true,
      note: true,
      productVariant: {
        select: {
          id: true,
          sku: true,
          variant: { select: { name: true } },
          product: { select: { name: true } },
        },
      },
      lines: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          materialId: true,
          componentSku: true,
          componentName: true,
          quantityPerUnit: true,
          unit: true,
          wastageRate: true,
          stage: true,
          required: true,
          sortOrder: true,
          note: true,
          material: { select: { id: true, sku: true, name: true, uom: true } },
        },
      },
    },
  });
  if (!bom) throw new InventoryError("not-found", "That BOM no longer exists.");
  return { ...bom, summary: summarize(bom.lines) };
}

/** Every version of one product's recipe — the dialog's left sidebar. */
export function listVersions(_actor: Actor, productVariantId: number) {
  return prisma.bom.findMany({
    where: { productVariantId, deletedAt: null },
    select: { id: true, name: true, version: true, status: true },
    orderBy: { version: "asc" },
  });
}

const lineData = (input: ReturnType<typeof bomSchema.parse>, bomId: number) =>
  input.lines.map((l, index) => ({
    bomId,
    materialId: l.materialId ?? null,
    componentSku: l.componentSku,
    componentName: blankToNull(l.componentName),
    quantityPerUnit: new Prisma.Decimal(l.quantityPerUnit),
    unit: l.unit,
    wastageRate: new Prisma.Decimal(l.wastageRate),
    stage: l.stage,
    required: l.required,
    sortOrder: l.sortOrder || index,
    note: blankToNull(l.note),
  }));

/**
 * Deactivate every OTHER version of this product's recipe.
 *
 * Called from all three activation paths (create-as-active, update-to-active,
 * activate) inside their transaction. One helper rather than three copies:
 * the copy that gets forgotten is the one that leaves two ACTIVE BOMs, and
 * nothing downstream can then say which one an order should follow.
 */
async function deactivateSiblings(
  tx: Prisma.TransactionClient,
  productVariantId: number,
  keepId: number,
) {
  await tx.bom.updateMany({
    where: { productVariantId, status: "ACTIVE", id: { not: keepId }, deletedAt: null },
    data: { status: "INACTIVE" },
  });
}

/** The next free version number for a product. */
async function nextVersion(tx: Prisma.TransactionClient, productVariantId: number) {
  const latest = await tx.bom.findFirst({
    where: { productVariantId },
    select: { version: true },
    orderBy: { version: "desc" },
  });
  return (latest?.version ?? 0) + 1;
}

export async function createBom(
  actor: Actor,
  productVariantId: number,
  raw: unknown,
  ctx: AuditContext,
) {
  const input = bomSchema.parse(raw);
  const product = await prisma.productVariant.findFirst({
    where: { id: productVariantId, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new InventoryError("item-not-found", "That SKU no longer exists.");

  if (input.status === "ACTIVE" && input.lines.length === 0) {
    throw new InventoryError("not-editable", "A BOM with no lines cannot be activated.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const version = input.version ?? (await nextVersion(tx, productVariantId));
    const bom = await tx.bom.create({
      data: {
        productVariantId,
        name: input.name,
        version,
        status: input.status,
        note: blankToNull(input.note),
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: { id: true, version: true },
    });
    if (input.lines.length) {
      await tx.bomLine.createMany({ data: lineData(input, bom.id) });
    }
    if (input.status === "ACTIVE") await deactivateSiblings(tx, productVariantId, bom.id);

    await writeAudit(tx, ctx, {
      action: "BOM_CREATED",
      targetType: "bom",
      targetId: String(bom.id),
      after: { productVariantId, version: bom.version, status: input.status, lines: input.lines.length },
    });
    return bom;
  });

  return { ok: true as const, id: created.id, version: created.version };
}

/**
 * Full line replace (deleteMany + createMany), which is legacy's semantics.
 *
 * Safe precisely because the movements ledger does NOT foreign-key its
 * bomLineId (doc 06 §A3): history keeps the id as a plain reference, so
 * replacing the lines cannot cascade a past consumption away.
 */
export async function updateBom(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const input = bomSchema.parse(raw);
  const existing = await prisma.bom.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, productVariantId: true, status: true, version: true },
  });
  if (!existing) throw new InventoryError("not-found", "That BOM no longer exists.");

  if (input.status === "ACTIVE" && input.lines.length === 0) {
    throw new InventoryError("not-editable", "A BOM with no lines cannot be activated.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.bomLine.deleteMany({ where: { bomId: id } });
    if (input.lines.length) await tx.bomLine.createMany({ data: lineData(input, id) });

    await tx.bom.update({
      where: { id },
      data: {
        name: input.name,
        status: input.status,
        note: blankToNull(input.note),
        updatedById: actor.id,
        ...(input.version ? { version: input.version } : {}),
      },
    });
    if (input.status === "ACTIVE") await deactivateSiblings(tx, existing.productVariantId, id);

    await writeAudit(tx, ctx, {
      action: "BOM_UPDATED",
      targetType: "bom",
      targetId: String(id),
      before: { status: existing.status },
      after: { status: input.status, lines: input.lines.length },
    });
  });

  return { ok: true as const };
}

/** Make this the one the floor follows. Refuses an empty recipe: activating a
 * BOM with no lines would let assignment "reserve" nothing and report success. */
export async function activateBom(actor: Actor, id: number, ctx: AuditContext) {
  const bom = await prisma.bom.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, productVariantId: true, status: true, _count: { select: { lines: true } } },
  });
  if (!bom) throw new InventoryError("not-found", "That BOM no longer exists.");
  if (bom._count.lines === 0) {
    throw new InventoryError("not-editable", "A BOM with no lines cannot be activated.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.bom.update({
      where: { id },
      data: { status: "ACTIVE", updatedById: actor.id, effectiveFrom: new Date() },
    });
    await deactivateSiblings(tx, bom.productVariantId, id);
    await writeAudit(tx, ctx, {
      action: "BOM_ACTIVATED",
      targetType: "bom",
      targetId: String(id),
      before: { status: bom.status },
      after: { status: "ACTIVE" },
    });
  });

  return { ok: true as const };
}

/** Copy to the next version as a DRAFT — how a recipe is revised without
 * touching the one production is currently following. */
export async function duplicateBom(actor: Actor, id: number, ctx: AuditContext) {
  const source = await getBom(actor, id);

  const created = await prisma.$transaction(async (tx) => {
    const version = await nextVersion(tx, source.productVariant.id);
    const bom = await tx.bom.create({
      data: {
        productVariantId: source.productVariant.id,
        name: source.name,
        version,
        status: "DRAFT",
        note: source.note,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: { id: true, version: true },
    });
    if (source.lines.length) {
      await tx.bomLine.createMany({
        data: source.lines.map((l) => ({
          bomId: bom.id,
          materialId: l.materialId,
          componentSku: l.componentSku,
          componentName: l.componentName,
          quantityPerUnit: l.quantityPerUnit,
          unit: l.unit,
          wastageRate: l.wastageRate,
          stage: l.stage,
          required: l.required,
          sortOrder: l.sortOrder,
          note: l.note,
        })),
      });
    }
    await writeAudit(tx, ctx, {
      action: "BOM_CREATED",
      targetType: "bom",
      targetId: String(bom.id),
      after: { duplicatedFrom: id, version: bom.version },
    });
    return bom;
  });

  return { ok: true as const, id: created.id, version: created.version };
}

/** Soft delete: past movements name this recipe, and a ledger that renders
 * "bom 41" instead of a name is a ledger nobody can audit. */
export async function deleteBom(actor: Actor, id: number, ctx: AuditContext) {
  const bom = await prisma.bom.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!bom) throw new InventoryError("not-found", "That BOM no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.bom.update({
      where: { id },
      data: { status: "INACTIVE", deletedAt: new Date(), updatedById: actor.id },
    });
    await writeAudit(tx, ctx, {
      action: "BOM_DELETED",
      targetType: "bom",
      targetId: String(id),
      after: { deleted: true },
    });
  });

  return { ok: true as const };
}
