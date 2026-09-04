/**
 * Warehouse master-data and membership logic. Transport-agnostic.
 *
 * A warehouse referenced by inventory or orders is NEVER hard-deleted — it is
 * deactivated, or soft-deleted only when nothing points at it. Membership is
 * many-to-many (WarehouseMember); User.warehouseId is a denormalised pointer
 * to the primary site, kept in sync in the same transaction.
 */
import {
  prisma,
  writeAudit,
  WAREHOUSE_SELECT,
  USER_PUBLIC_SELECT,
  Prisma,
  warehouseScopeIds,
  canUseWarehouse,
  type AuditContext,
} from "@gwprint/db";

import { warehouseSchema } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;
const blankToNull = (v?: string) => (v && v.length ? v : null);

/**
 * WAREHOUSE/WAREHOUSE_ADMIN are site-bound everywhere else (stock, movements,
 * receipts — see stock/service/scope.ts) but this master-data list had no
 * scope filter at all, so a WAREHOUSE_ADMIN for one site saw every site in
 * the company here. warehouses.read is deliberately granted to both roles —
 * the fix is to filter, not to gate the permission tighter.
 */
export async function listWarehouses(actor: Actor, opts: { includeInactive?: boolean } = {}) {
  const ids = await warehouseScopeIds(actor);
  return prisma.warehouse.findMany({
    where: {
      deletedAt: null,
      ...(opts.includeInactive ? {} : { status: "ACTIVE" }),
      ...(ids === null ? {} : { id: { in: ids } }),
    },
    select: { ...WAREHOUSE_SELECT, _count: { select: { members: true, orders: true, inventory: true } } },
    orderBy: { name: "asc" },
  });
}

/** A miss here is a 404, not a 403 — an out-of-scope id resolves to nothing
 * rather than confirming the warehouse exists (the scope goes in the WHERE,
 * same as getOrder). */
export async function getWarehouse(actor: Actor, id: number) {
  const ids = await warehouseScopeIds(actor);
  // -1 when out of scope: no row can ever have that id, so findFirstOrThrow
  // throws the same not-found it would for a made-up id.
  const scopedId = ids === null || ids.includes(id) ? id : -1;
  return prisma.warehouse.findFirstOrThrow({
    where: { id: scopedId, deletedAt: null },
    select: {
      ...WAREHOUSE_SELECT,
      members: {
        // Email as well as the public fields: the staff dialog has to
        // distinguish two colleagues who share a display name.
        select: {
          isPrimary: true,
          user: { select: { ...USER_PUBLIC_SELECT, email: true } },
        },
        orderBy: { isPrimary: "desc" },
      },
    },
  });
}

/**
 * People who may be assigned to a warehouse — warehouse-shaped roles only.
 * Offering to put a seller on a warehouse rota is a mistake the UI shouldn't
 * invite, and the roles are what the order scoping keys off anyway.
 */
export function listAssignableStaff(_actor: Actor) {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      roles: { hasSome: ["WAREHOUSE", "WAREHOUSE_ADMIN"] },
    },
    select: { id: true, name: true, email: true },
    orderBy: { email: "asc" },
  });
}

function toData(input: ReturnType<typeof warehouseSchema.parse>) {
  return {
    code: input.code.toUpperCase(),
    name: input.name,
    description: blankToNull(input.description),
    region: blankToNull(input.region),
    line1: blankToNull(input.line1),
    line2: blankToNull(input.line2),
    city: blankToNull(input.city),
    state: blankToNull(input.state),
    zip: blankToNull(input.zip),
    country: blankToNull(input.country),
    timezone: input.timezone,
    contactName: blankToNull(input.contactName),
    contactEmail: blankToNull(input.contactEmail),
    contactPhone: blankToNull(input.contactPhone),
    status: input.status,
  };
}

export async function createWarehouse(actor: Actor, raw: unknown, ctx: AuditContext) {
  const data = toData(warehouseSchema.parse(raw));
  try {
    const wh = await prisma.$transaction(async (tx) => {
      const created = await tx.warehouse.create({ data, select: { id: true, code: true, name: true } });
      await writeAudit(tx, ctx, {
        action: "WAREHOUSE_CREATED",
        targetType: "customer",
        targetId: String(created.id),
        after: { code: created.code, name: created.name },
      });
      return created;
    });
    return { ok: true as const, id: wh.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, error: "code-taken" as const };
    }
    throw e;
  }
}

export async function updateWarehouse(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const data = toData(warehouseSchema.parse(raw));
  const before = await prisma.warehouse.findFirstOrThrow({ where: { id, deletedAt: null }, select: WAREHOUSE_SELECT });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.warehouse.update({ where: { id }, data });
      await writeAudit(tx, ctx, {
        action: "WAREHOUSE_UPDATED",
        targetType: "customer",
        targetId: String(id),
        before,
        after: data,
      });
    });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, error: "code-taken" as const };
    }
    throw e;
  }
}

export async function setWarehouseStatus(actor: Actor, id: number, status: "ACTIVE" | "INACTIVE", ctx: AuditContext) {
  await prisma.$transaction(async (tx) => {
    await tx.warehouse.update({ where: { id }, data: { status } });
    await writeAudit(tx, ctx, {
      action: "WAREHOUSE_STATUS_CHANGED",
      targetType: "customer",
      targetId: String(id),
      after: { status },
    });
  });
  return { ok: true as const };
}

/** Counts of everything that references the warehouse — drives can_delete and
 * the "used by" pills in the delete dialog. */
export async function getWarehouseUsage(_actor: Actor, id: number) {
  const [members, orders, inventory, stockImports] = await Promise.all([
    prisma.warehouseMember.count({ where: { warehouseId: id } }),
    prisma.order.count({ where: { warehouseId: id } }),
    prisma.warehouseInventory.count({ where: { warehouseId: id } }),
    prisma.stockImport.count({ where: { warehouseId: id } }),
  ]);
  const total = members + orders + inventory + stockImports;
  return { members, orders, inventory, stockImports, canDelete: total === 0 };
}

export async function deleteWarehouse(actor: Actor, id: number, ctx: AuditContext) {
  const usage = await getWarehouseUsage(actor, id);
  if (!usage.canDelete) return { ok: false as const, error: "in-use" as const, usage };
  await prisma.$transaction(async (tx) => {
    await tx.warehouse.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
    await writeAudit(tx, ctx, { action: "WAREHOUSE_STATUS_CHANGED", targetType: "customer", targetId: String(id), after: { deleted: true } });
  });
  return { ok: true as const };
}

// ── Members ──────────────────────────────────────────────────────────────────

export async function addWarehouseMember(actor: Actor, warehouseId: number, userId: string, isPrimary: boolean, ctx: AuditContext) {
  if (!(await canUseWarehouse(actor, warehouseId))) {
    return { ok: false as const, error: "not-your-site" as const };
  }
  await prisma.$transaction(async (tx) => {
    await tx.warehouseMember.upsert({
      where: { userId_warehouseId: { userId, warehouseId } },
      create: { userId, warehouseId, isPrimary },
      update: { isPrimary },
    });
    if (isPrimary) {
      // Exactly one primary per user, and keep the denormalised pointer in sync.
      await tx.warehouseMember.updateMany({
        where: { userId, warehouseId: { not: warehouseId } },
        data: { isPrimary: false },
      });
      await tx.user.update({ where: { id: userId }, data: { warehouseId } });
    }
    await writeAudit(tx, ctx, {
      action: "WAREHOUSE_MEMBER_ADDED",
      targetType: "customer",
      targetId: String(warehouseId),
      after: { userId, isPrimary },
    });
  });
  return { ok: true as const };
}

export async function removeWarehouseMember(actor: Actor, warehouseId: number, userId: string, ctx: AuditContext) {
  if (!(await canUseWarehouse(actor, warehouseId))) {
    return { ok: false as const, error: "not-your-site" as const };
  }
  await prisma.$transaction(async (tx) => {
    await tx.warehouseMember.deleteMany({ where: { warehouseId, userId } });
    // If this was their primary site, clear the denormalised pointer.
    await tx.user.updateMany({ where: { id: userId, warehouseId }, data: { warehouseId: null } });
    await writeAudit(tx, ctx, {
      action: "WAREHOUSE_MEMBER_REMOVED",
      targetType: "customer",
      targetId: String(warehouseId),
      after: { userId },
    });
  });
  return { ok: true as const };
}
