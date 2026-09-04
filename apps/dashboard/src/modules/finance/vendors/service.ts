/**
 * Supplier master data.
 *
 * The one rule worth stating: a vendor that receipts or expenses point at is
 * NEVER hard-deleted — it is deactivated, exactly as warehouses behave. A
 * deleted supplier would leave last quarter's paperwork pointing at nothing,
 * and "who did we buy this from" is the question the table exists to answer.
 */
import { prisma, writeAudit, Prisma, type AuditContext } from "@gwprint/db";

import { vendorListSchema, vendorSchema, type VendorListQuery } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;
const blankToNull = (v?: string) => (v && v.length ? v : null);

const VENDOR_SELECT = {
  id: true,
  code: true,
  name: true,
  contactName: true,
  phone: true,
  email: true,
  address: true,
  taxCode: true,
  note: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.VendorSelect;

export async function listVendors(_actor: Actor, raw: VendorListQuery = {}) {
  const query = vendorListSchema.parse(raw);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const like = query.search
    ? { contains: query.search, mode: "insensitive" as const }
    : undefined;

  const where: Prisma.VendorWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(like
      ? {
          OR: [
            { code: like },
            { name: like },
            { contactName: like },
            { phone: like },
            { email: like },
            { taxCode: like },
          ],
        }
      : {}),
  };

  // Tiles come from their own COUNTs over the whole table, never from summing
  // the page on screen — the doc 06 rule the legacy page broke.
  const [rows, total, active, inactive] = await Promise.all([
    prisma.vendor.findMany({
      where,
      select: { ...VENDOR_SELECT, _count: { select: { shipments: true, expenses: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vendor.count({ where }),
    prisma.vendor.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.vendor.count({ where: { deletedAt: null, status: "INACTIVE" } }),
  ]);

  return {
    total,
    tiles: { total: active + inactive, active, inactive },
    rows: rows.map(({ _count, ...vendor }) => ({
      ...vendor,
      /** What points at this vendor. Drives delete-vs-deactivate in the UI. */
      usage: _count.shipments + _count.expenses,
    })),
  };
}

/** Everyone who can be picked in a form — code + name only, and active only:
 * an expense should not offer a supplier the company stopped using. */
export function listVendorOptions(_actor: Actor) {
  return prisma.vendor.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * VND-1, VND-2… when the form leaves the code blank — legacy's behaviour, kept
 * because a supplier's own reference is rarely something the person typing has
 * to hand.
 *
 * ponytail: max+1 on a LIKE scan, not a sequence. Ceiling = two vendors created
 * in the same millisecond can collide, and the caller retries on the unique
 * violation. Upgrade path: a Postgres sequence, once vendors are created by
 * anything other than a human clicking a button.
 */
async function nextVendorCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.vendor.findMany({
    where: { code: { startsWith: "VND-" } },
    select: { code: true },
  });
  const highest = rows.reduce((max, column) => {
    const n = Number(column.code.slice(4));
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
  return `VND-${highest + 1}`;
}

export async function createVendor(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = vendorSchema.parse(raw);
  try {
    const vendor = await prisma.$transaction(async (tx) => {
      const created = await tx.vendor.create({
        data: {
          code: input.code ? input.code.toUpperCase() : await nextVendorCode(tx),
          name: input.name,
          contactName: blankToNull(input.contactName),
          phone: blankToNull(input.phone),
          email: blankToNull(input.email),
          address: blankToNull(input.address),
          taxCode: blankToNull(input.taxCode),
          note: blankToNull(input.note),
          status: input.status,
        },
        select: { id: true, code: true, name: true },
      });
      await writeAudit(tx, ctx, {
        action: "VENDOR_CREATED",
        targetType: "vendor",
        targetId: String(created.id),
        after: { code: created.code, name: created.name },
      });
      return created;
    });
    return { ok: true as const, id: vendor.id, code: vendor.code };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, error: "code-taken" as const };
    }
    throw e;
  }
}

export async function updateVendor(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const input = vendorSchema.parse(raw);
  const before = await prisma.vendor.findFirstOrThrow({
    where: { id, deletedAt: null },
    select: VENDOR_SELECT,
  });
  const data = {
    // A blank code on EDIT keeps the one it already has: clearing it would
    // renumber a supplier every receipt already refers to.
    code: input.code ? input.code.toUpperCase() : before.code,
    name: input.name,
    contactName: blankToNull(input.contactName),
    phone: blankToNull(input.phone),
    email: blankToNull(input.email),
    address: blankToNull(input.address),
    taxCode: blankToNull(input.taxCode),
    note: blankToNull(input.note),
    status: input.status,
  };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.vendor.update({ where: { id }, data });
      await writeAudit(tx, ctx, {
        action: "VENDOR_UPDATED",
        targetType: "vendor",
        targetId: String(id),
        before: { code: before.code, name: before.name, status: before.status },
        after: { code: data.code, name: data.name, status: data.status },
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

/** What points at this vendor — the answer to "may I delete it?". */
export async function getVendorUsage(_actor: Actor, id: number) {
  const [shipments, expenses] = await Promise.all([
    prisma.stockReceiptShipment.count({ where: { vendorId: id } }),
    prisma.expenseEntry.count({ where: { vendorId: id, deletedAt: null } }),
  ]);
  return { shipments, expenses, canDelete: shipments + expenses === 0 };
}

/**
 * Delete when nothing points at it; DEACTIVATE when something does — the
 * customer pattern, and the reason is the same: history has to keep resolving.
 * The caller is told which of the two happened.
 */
export async function deleteVendor(actor: Actor, id: number, ctx: AuditContext) {
  const usage = await getVendorUsage(actor, id);
  const deactivated = !usage.canDelete;

  await prisma.$transaction(async (tx) => {
    await tx.vendor.update({
      where: { id },
      data: deactivated ? { status: "INACTIVE" } : { deletedAt: new Date(), status: "INACTIVE" },
    });
    await writeAudit(tx, ctx, {
      action: deactivated ? "VENDOR_UPDATED" : "VENDOR_DELETED",
      targetType: "vendor",
      targetId: String(id),
      after: deactivated ? { status: "INACTIVE", reason: "in-use" } : { deleted: true },
    });
  });

  return { ok: true as const, deactivated, usage };
}
