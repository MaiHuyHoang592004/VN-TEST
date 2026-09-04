/**
 * The admin view of the ledger, plus the approve/reject workflow legacy had.
 *
 * The money ENGINE is not here: balances are moved by core/ledger.ts, which
 * identity's top-ups and fulfillment's order charges also use. This module
 * decides WHO may settle a pending column and WHAT the refusal rules are; it does
 * not do arithmetic on a balance, because a second routine that does would
 * eventually disagree with the first.
 */
import {
  prisma,
  writeAudit,
  transactionScope,
  TRANSACTION_ADMIN_SELECT,
  Prisma,
  type AuditContext,
} from "@gwprint/db";

import { settlePendingTransaction, NegativeBalanceError } from "../../core/ledger.ts";
import { notify } from "../../platform/index.ts";
import { rejectTransactionSchema, transactionListSchema, type TransactionListQuery } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;

/**
 * The ledger as `actor` may see it. Scope first — the SAME transactionScope
 * the seller's own /profile/billing uses, which is why that page cannot
 * regress when this one is added.
 */
export async function listTransactions(actor: Actor, raw: TransactionListQuery = {}) {
  const query = transactionListSchema.parse(raw);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where: Prisma.TransactionWhereInput = {
    ...(await transactionScope(actor)),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { publicId: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
            { note: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      select: TRANSACTION_ADMIN_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function getTransaction(actor: Actor, id: number) {
  return prisma.transaction.findFirstOrThrow({
    where: { ...(await transactionScope(actor)), id },
    select: TRANSACTION_ADMIN_SELECT,
  });
}

/** Only money that flows TOWARD the seller is approvable. An ORDER_PAYMENT is
 * charged atomically at assignment and an ADJUSTMENT is an admin's own act —
 * neither waits on approval, and letting one be "approved" here would credit a
 * balance twice. */
const APPROVABLE = ["TOPUP", "REFUND"] as const;

/**
 * Approve a pending top-up or refund: apply its amount and mark it COMPLETED.
 *
 * Idempotent by COMPARE-AND-SET on the column's status rather than by a
 * client-supplied key (see settlePendingTransaction). Two admins clicking
 * Approve at the same moment produce exactly one credit; the second is told
 * the column is no longer pending.
 */
export async function approveTransaction(actor: Actor, id: number, ctx: AuditContext) {
  const column = await prisma.transaction.findUnique({
    where: { id },
    select: { id: true, userId: true, amount: true, type: true, status: true },
  });
  if (!column) return { ok: false as const, error: "not-found" as const };
  if (column.status !== "PENDING") return { ok: false as const, error: "not-pending" as const };
  if (!APPROVABLE.includes(column.type as (typeof APPROVABLE)[number])) {
    return { ok: false as const, error: "not-approvable" as const };
  }

  try {
    const settled = await prisma.$transaction(async (tx) => {
      const done = await settlePendingTransaction(tx, ctx, {
        transactionId: column.id,
        userId: column.userId,
        amount: column.amount,
        reason: `Approved ${column.type.toLowerCase()}`,
      });
      // The seller asked for this and has been waiting on it. Same transaction
      // as the credit, so an approval that rolls back never announces itself.
      if (done) {
        await notify(tx, {
          userId: column.userId,
          type: "TRANSACTION_APPROVED",
          data: { amount: column.amount.abs().toFixed(2), balance: done.after.toFixed(2) },
          href: "/profile/billing",
        });
      }
      return done;
    });
    // Someone else settled it between the read and the write.
    if (!settled) return { ok: false as const, error: "not-pending" as const };
    return { ok: true as const, before: settled.before.toFixed(2), after: settled.after.toFixed(2) };
  } catch (e) {
    if (e instanceof NegativeBalanceError) {
      return { ok: false as const, error: "insufficient-balance" as const };
    }
    throw e;
  }
}

/**
 * Reject a pending column. NO balance change — that is the whole point, and the
 * reason it does not go anywhere near core/ledger.ts.
 */
export async function rejectTransaction(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const { reason } = rejectTransactionSchema.parse(raw);
  const column = await prisma.transaction.findUnique({
    where: { id },
    select: { id: true, status: true, note: true, userId: true, amount: true },
  });
  if (!column) return { ok: false as const, error: "not-found" as const };
  if (column.status !== "PENDING") return { ok: false as const, error: "not-pending" as const };

  const claimed = await prisma.$transaction(async (tx) => {
    // Same compare-and-set as approval, so a reject cannot land on a column
    // another admin just approved.
    const hit = await tx.transaction.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED", note: reason },
    });
    if (hit.count === 0) return false;
    await writeAudit(tx, ctx, {
      action: "TRANSACTION_REJECTED",
      targetType: "transaction",
      targetId: String(id),
      before: { status: "PENDING" },
      after: { status: "CANCELLED" },
      reason,
    });
    // A refusal the seller cannot see is how a support ticket starts, so the
    // REASON travels with it — that is why reason is required at all.
    await notify(tx, {
      userId: column.userId,
      type: "TRANSACTION_REJECTED",
      data: { amount: column.amount.abs().toFixed(2), reason },
      href: "/profile/billing",
    });
    return true;
  });
  return claimed ? { ok: true as const } : { ok: false as const, error: "not-pending" as const };
}
