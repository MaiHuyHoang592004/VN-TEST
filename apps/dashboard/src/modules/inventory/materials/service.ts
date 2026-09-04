/**
 * Material master data — what an item IS, never how many exist.
 *
 * Quantities live in modules/inventory/stock; this module deliberately cannot
 * change a count. Splitting them is what keeps "rename a material" out of the
 * code path that moves goods.
 */
import {
  prisma,
  writeAudit,
  warehouseScope,
  Prisma,
  type AuditContext,
} from "@gwprint/db";

import { availableOf } from "../stock/counters.ts";
import { MATERIAL_TYPES, materialSchema } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;

const blankToNull = (v?: string) => (v && v.length ? v : null);

function toData(input: ReturnType<typeof materialSchema.parse>) {
  return {
    sku: input.sku,
    name: input.name,
    type: input.type,
    uom: input.uom,
    description: blankToNull(input.description),
    status: input.status,
    trackInventory: input.trackInventory,
  };
}

export type MaterialFilter = {
  search?: string;
  type?: (typeof MATERIAL_TYPES)[number];
  status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
  page?: number;
  pageSize?: number;
};

/**
 * The list screen's rows: master data plus the ONE number it shows — total
 * availability across the sites this actor may see.
 *
 * Stock rows are scoped even here, on a master-data page, because "available"
 * would otherwise leak the size of a customer the viewer has no access to.
 */
export async function listMaterials(actor: Actor, filter: MaterialFilter = {}) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
  const scope = await warehouseScope(actor);

  const where: Prisma.MaterialWhereInput = {
    deletedAt: null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.search
      ? {
          OR: [
            { sku: { contains: filter.search, mode: "insensitive" as const } },
            { name: { contains: filter.search, mode: "insensitive" as const } },
            { description: { contains: filter.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.material.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        type: true,
        uom: true,
        status: true,
        trackInventory: true,
        description: true,
        stockRows: {
          where: scope,
          select: { quantity: true, reserved: true, needed: true },
        },
        _count: { select: { bomLines: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.material.count({ where }),
  ]);

  return {
    total,
    rows: rows.map(({ stockRows, _count, ...m }) => ({
      ...m,
      bomLines: _count.bomLines,
      available: stockRows.reduce((sum, r) => sum + availableOf(r), 0),
    })),
  };
}

export async function createMaterial(actor: Actor, raw: unknown, ctx: AuditContext) {
  const data = toData(materialSchema.parse(raw));
  try {
    const created = await prisma.$transaction(async (tx) => {
      const column = await tx.material.create({ data, select: { id: true, sku: true, name: true } });
      await writeAudit(tx, ctx, {
        action: "MATERIAL_CREATED",
        targetType: "material",
        targetId: String(column.id),
        after: { sku: column.sku, name: column.name },
      });
      return column;
    });
    return { ok: true as const, id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, error: "sku-taken" as const };
    }
    throw e;
  }
}

export async function updateMaterial(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const data = toData(materialSchema.parse(raw));
  const before = await prisma.material.findFirstOrThrow({
    where: { id, deletedAt: null },
    select: { sku: true, name: true, type: true, uom: true, status: true, trackInventory: true },
  });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.material.update({ where: { id }, data });
      await writeAudit(tx, ctx, {
        action: "MATERIAL_UPDATED",
        targetType: "material",
        targetId: String(id),
        before,
        after: data,
      });
    });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, error: "sku-taken" as const };
    }
    throw e;
  }
}

/**
 * What still points at this material — drives the delete dialog, same shape as
 * getWarehouseUsage.
 *
 * Only ACTIVE BOMs block: a draft recipe is somebody's work in progress and an
 * inactive one is history, neither of which should stop the floor retiring an
 * item they no longer buy (legacy rule, material-item.service.ts:97-109).
 */
export async function getMaterialUsage(_actor: Actor, id: number) {
  const [activeBomLines, bomLines, stockRows] = await Promise.all([
    prisma.bomLine.count({ where: { materialId: id, bom: { status: "ACTIVE", deletedAt: null } } }),
    prisma.bomLine.count({ where: { materialId: id } }),
    prisma.materialStock.count({ where: { materialId: id, quantity: { gt: 0 } } }),
  ]);
  return { activeBomLines, bomLines, stockRows, canDelete: activeBomLines === 0 };
}

/**
 * Soft delete. The column survives because movements, receipt lines and past BOMs
 * name it, and a ledger that renders "material 41" instead of a name is a
 * ledger nobody can audit.
 */
export async function deleteMaterial(actor: Actor, id: number, ctx: AuditContext) {
  const usage = await getMaterialUsage(actor, id);
  if (!usage.canDelete) return { ok: false as const, error: "in-use" as const, usage };

  await prisma.$transaction(async (tx) => {
    await tx.material.update({
      where: { id },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });
    await writeAudit(tx, ctx, {
      action: "MATERIAL_UPDATED",
      targetType: "material",
      targetId: String(id),
      after: { deleted: true },
    });
  });
  return { ok: true as const };
}

/** Active suppliers for pickers (adjust dialog, receipt lines, BOM lines). */
export function listMaterialOptions(_actor: Actor, search?: string) {
  return prisma.material.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, sku: true, name: true, uom: true },
    orderBy: { name: "asc" },
    take: 50,
  });
}
