/**
 * The company's own books: rent, ink, salaries, scrap sales.
 *
 * Deliberately NOT the seller ledger. Nothing here moves a User balance, so
 * there is no idempotency key, no compare-and-set and no core/ledger call — an
 * expense column is a note about money that already moved somewhere else. Keeping
 * the two apart is what stops a bookkeeping mistake from ever touching a
 * seller's wallet.
 *
 * The one rule inherited from doc 06: the tiles are computed SERVER-SIDE over
 * the whole filter (a groupBy, not a sum of the page), because the legacy page
 * added up whatever it had rendered and lied on every second page.
 */
import { prisma, writeAudit, Prisma, type AuditContext } from "@gwprint/db";

import {
  categorySchema,
  entryListSchema,
  entrySchema,
  type EntryListQuery,
} from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;
const blankToNull = (v?: string) => (v && v.length ? v : null);

export type ExpenseErrorCode = "not-found" | "category-in-use";

export class ExpenseError extends Error {
  readonly code: ExpenseErrorCode;
  readonly detail?: unknown;
  // Fields assigned explicitly, not via parameter properties: node --test
  // strips types rather than compiling them (modules/README.md).
  constructor(code: ExpenseErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "ExpenseError";
    this.code = code;
    this.detail = detail;
  }
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(_actor: Actor) {
  const rows = await prisma.expenseCategory.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      note: true,
      updatedAt: true,
      _count: { select: { entries: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map(({ _count, ...category }) => ({ ...category, entryCount: _count.entries }));
}

export async function createCategory(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = categorySchema.parse(raw);
  const created = await prisma.$transaction(async (tx) => {
    const column = await tx.expenseCategory.create({
      data: { name: input.name, type: input.type, note: blankToNull(input.note) },
      select: { id: true, name: true },
    });
    await writeAudit(tx, ctx, {
      action: "EXPENSE_CATEGORY_CREATED",
      targetType: "expense_category",
      targetId: String(column.id),
      after: { name: column.name, type: input.type },
    });
    return column;
  });
  return { ok: true as const, id: created.id };
}

export async function updateCategory(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const input = categorySchema.parse(raw);
  const before = await prisma.expenseCategory.findFirst({
    where: { id, deletedAt: null },
    select: { name: true, type: true, note: true },
  });
  if (!before) throw new ExpenseError("not-found", "That category no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.expenseCategory.update({
      where: { id },
      data: { name: input.name, type: input.type, note: blankToNull(input.note) },
    });
    await writeAudit(tx, ctx, {
      action: "EXPENSE_CATEGORY_UPDATED",
      targetType: "expense_category",
      targetId: String(id),
      before,
      after: { name: input.name, type: input.type },
    });
  });
  return { ok: true as const };
}

/**
 * Refused while entries point at it. Unlike a vendor there is no "deactivate"
 * fallback: a category with no entries is just a typo to remove, and one WITH
 * entries must keep resolving or last year's report loses its labels. Move the
 * entries first.
 */
export async function deleteCategory(actor: Actor, id: number, ctx: AuditContext) {
  const entries = await prisma.expenseEntry.count({ where: { categoryId: id, deletedAt: null } });
  if (entries > 0) {
    throw new ExpenseError("category-in-use", "Move its entries before deleting it.", { entries });
  }
  await prisma.$transaction(async (tx) => {
    await tx.expenseCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit(tx, ctx, {
      action: "EXPENSE_CATEGORY_DELETED",
      targetType: "expense_category",
      targetId: String(id),
      after: { deleted: true },
    });
  });
  return { ok: true as const };
}

// ── Entries ──────────────────────────────────────────────────────────────────

function entryWhere(query: EntryListQuery): Prisma.ExpenseEntryWhereInput {
  const like = query.search ? { contains: query.search, mode: "insensitive" as const } : undefined;
  return {
    deletedAt: null,
    ...(query.type ? { type: query.type } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(query.from || query.to
      ? {
          occurredAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(like
      ? {
          OR: [
            { description: like },
            { paymentMethod: like },
            { category: { name: like } },
            { vendor: { name: like } },
          ],
        }
      : {}),
  };
}

export async function listEntries(_actor: Actor, raw: EntryListQuery = {}) {
  const query = entryListSchema.parse(raw);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where = entryWhere(query);

  const [rows, total, grouped] = await Promise.all([
    prisma.expenseEntry.findMany({
      where,
      select: {
        id: true,
        type: true,
        amount: true,
        occurredAt: true,
        paymentMethod: true,
        description: true,
        category: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expenseEntry.count({ where }),
    // The tiles: one groupBy over the WHOLE filter, not a sum of `rows`.
    prisma.expenseEntry.groupBy({ by: ["type"], where, _sum: { amount: true } }),
  ]);

  const sumOf = (type: "EXPENSE" | "INCOME") =>
    grouped.find((g) => g.type === type)?._sum.amount ?? new Prisma.Decimal(0);
  const expense = sumOf("EXPENSE");
  const income = sumOf("INCOME");

  return {
    total,
    summary: {
      expense: expense.toFixed(2),
      income: income.toFixed(2),
      /** Income minus expense — the only number here that can be negative. */
      net: income.sub(expense).toFixed(2),
      count: total,
    },
    rows,
  };
}

function entryData(input: ReturnType<typeof entrySchema.parse>) {
  return {
    categoryId: input.categoryId,
    type: input.type,
    amount: new Prisma.Decimal(input.amount),
    occurredAt: new Date(input.occurredAt),
    vendorId: input.vendorId ?? null,
    paymentMethod: blankToNull(input.paymentMethod),
    description: blankToNull(input.description),
  };
}

export async function createEntry(actor: Actor, raw: unknown, ctx: AuditContext) {
  const data = entryData(entrySchema.parse(raw));
  const created = await prisma.$transaction(async (tx) => {
    const column = await tx.expenseEntry.create({
      data: { ...data, createdById: actor.id },
      select: { id: true },
    });
    await writeAudit(tx, ctx, {
      action: "EXPENSE_CREATED",
      targetType: "expense",
      targetId: String(column.id),
      after: { type: data.type, amount: data.amount.toFixed(2), categoryId: data.categoryId },
    });
    return column;
  });
  return { ok: true as const, id: created.id };
}

export async function updateEntry(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const data = entryData(entrySchema.parse(raw));
  const before = await prisma.expenseEntry.findFirst({
    where: { id, deletedAt: null },
    select: { type: true, amount: true, categoryId: true },
  });
  if (!before) throw new ExpenseError("not-found", "That entry no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.expenseEntry.update({ where: { id }, data });
    await writeAudit(tx, ctx, {
      action: "EXPENSE_UPDATED",
      targetType: "expense",
      targetId: String(id),
      before: { type: before.type, amount: before.amount.toFixed(2), categoryId: before.categoryId },
      after: { type: data.type, amount: data.amount.toFixed(2), categoryId: data.categoryId },
    });
  });
  return { ok: true as const };
}

/** Soft delete: a removed line still has to be explainable next audit. */
export async function deleteEntry(actor: Actor, id: number, ctx: AuditContext) {
  const before = await prisma.expenseEntry.findFirst({
    where: { id, deletedAt: null },
    select: { type: true, amount: true },
  });
  if (!before) throw new ExpenseError("not-found", "That entry no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.expenseEntry.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit(tx, ctx, {
      action: "EXPENSE_DELETED",
      targetType: "expense",
      targetId: String(id),
      before: { type: before.type, amount: before.amount.toFixed(2) },
      after: { deleted: true },
    });
  });
  return { ok: true as const };
}
