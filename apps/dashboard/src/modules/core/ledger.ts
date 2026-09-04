/**
 * The one routine that moves a balance. Every credit and every debit in the
 * system goes through it: admin top-ups and refunds (identity), order
 * assignment charges (fulfillment), and transaction approvals (finance).
 *
 * It lives in core rather than in a domain because THREE domains need it, and
 * the repo's rule is that a thing two domains need belongs to neither. The
 * alternative — each domain writing its own balance-and-ledger pair — is the
 * specific failure this file exists to prevent: two routines that agree today,
 * diverge in six months, and leave a ledger that no longer explains the
 * balance. There is one place to audit, and this is it.
 *
 * It takes a TRANSACTION CLIENT, never the global prisma, so the caller
 * composes it with their own work — assignOrders charges a seller and stamps
 * their orders in the same atomic unit. A balance write that commits without
 * its ledger column, or an order marked assigned without its charge, is the class
 * of bug the legacy system shipped.
 *
 * The invariants, all enforced here:
 *   • balance, ledger column and audit column commit together or not at all;
 *   • amounts are Decimal end to end, never a JS float;
 *   • a balance may not go negative — the caller gets a typed refusal;
 *   • idempotency is a UNIQUE constraint on the ledger column, not an app-level
 *     check that would race. See applyBalanceMove's callers for the retry
 *     handling that pairs with it.
 */
// No `server-only` here, deliberately: this is an internal service-layer file,
// not a boundary one, and node --test must be able to import it. That is what
// keeps the money rules directly testable (modules/README.md).
import { prisma, writeAudit, Prisma, type AuditContext } from "@gwprint/db";

/** The transaction client shape this needs — a subset of Prisma's. */
export type LedgerTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type LedgerKind = "TOPUP" | "REFUND" | "ADJUSTMENT" | "ORDER_PAYMENT";

const LEDGER_AUDIT_ACTION = {
  TOPUP: "BALANCE_TOPUP",
  REFUND: "BALANCE_REFUND",
  ADJUSTMENT: "BALANCE_ADJUSTED",
  ORDER_PAYMENT: "BALANCE_ADJUSTED",
} as const;

/** Thrown when a move would take a balance below zero. Callers turn it into a
 * typed refusal; it must never escape as a 500. */
export class NegativeBalanceError extends Error {
  constructor() {
    super("insufficient balance");
    this.name = "NegativeBalanceError";
  }
}

export type BalanceMove = {
  userId: string;
  kind: LedgerKind;
  /** Signed: negative debits. */
  amount: Prisma.Decimal;
  reason: string;
  idempotencyKey: string;
  paymentMethod?: string | null;
  description?: string | null;
};

/**
 * Apply one balance move inside the caller's transaction.
 *
 * Returns the ledger column id and the before/after balances so the caller can
 * show "balance X → Y" without re-reading.
 */
/**
 * Read, guard and write one balance. The ONLY place a balance number is
 * computed — both applyBalanceMove (which creates a ledger column) and
 * settlePendingTransaction (which completes one that already exists) go
 * through it, so the arithmetic and the negative-balance rule cannot differ
 * between "an admin topped you up" and "an admin approved your top-up".
 */
async function shiftBalance(
  tx: LedgerTx,
  userId: string,
  amount: Prisma.Decimal,
): Promise<{ before: Prisma.Decimal; after: Prisma.Decimal }> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });
  const before = user.balance;
  const after = before.add(amount);
  if (after.lessThan(0)) throw new NegativeBalanceError();
  await tx.user.update({ where: { id: userId }, data: { balance: after } });
  return { before, after };
}

export async function applyBalanceMove(
  tx: LedgerTx,
  ctx: AuditContext,
  move: BalanceMove,
): Promise<{ transactionId: number; before: Prisma.Decimal; after: Prisma.Decimal }> {
  const { before, after } = await shiftBalance(tx, move.userId, move.amount);
  const txn = await tx.transaction.create({
    data: {
      userId: move.userId,
      amount: move.amount,
      type: move.kind,
      status: "COMPLETED",
      paymentMethod: move.paymentMethod ?? null,
      description: move.description ?? null,
      note: move.reason,
      balanceBefore: before,
      balanceAfter: after,
      idempotencyKey: move.idempotencyKey,
    },
    select: { id: true },
  });
  await writeAudit(tx, ctx, {
    action: LEDGER_AUDIT_ACTION[move.kind],
    targetType: "user",
    targetId: move.userId,
    before: { balance: before.toFixed(2) },
    after: { balance: after.toFixed(2) },
    reason: move.reason,
  });
  // Deliberately NO notification here. core may not import a domain (the
  // ESLint boundary enforces it, and it is right to): telling a person their
  // money moved is identity's business, not the ledger's. Callers that want it
  // send it inside the SAME transaction they opened around this call, so a
  // rolled-back move still never announces itself.
  return { transactionId: txn.id, before, after };
}

/**
 * Complete a PENDING ledger column: apply its amount to the balance and stamp the
 * column COMPLETED with the before/after it produced.
 *
 * The sibling of applyBalanceMove, and the difference matters. That one CREATES
 * a column for a move an admin is making now. This one FINISHES a column that already
 * exists — a top-up a seller claimed, or a legacy column that came across the
 * cutover still pending. Approving through applyBalanceMove would leave the
 * original PENDING column sitting there plus a second COMPLETED one, and the
 * ledger would stop explaining the balance.
 *
 * The double-approve guard is a COMPARE-AND-SET on status, not a client-supplied
 * idempotency key: the update only matches while the column is still PENDING, so
 * two approvals racing produce exactly one credit and the loser sees a
 * zero-column update. That is strictly stronger than a key — it needs nothing
 * from the caller and cannot be defeated by sending a fresh one.
 *
 * Returns null when the column was already settled by someone else.
 */
export async function settlePendingTransaction(
  tx: LedgerTx,
  ctx: AuditContext,
  input: { transactionId: number; userId: string; amount: Prisma.Decimal; reason: string },
): Promise<{ before: Prisma.Decimal; after: Prisma.Decimal } | null> {
  const claimed = await tx.transaction.updateMany({
    where: { id: input.transactionId, status: "PENDING" },
    data: { status: "COMPLETED" },
  });
  if (claimed.count === 0) return null;

  const { before, after } = await shiftBalance(tx, input.userId, input.amount);
  await tx.transaction.update({
    where: { id: input.transactionId },
    data: { balanceBefore: before, balanceAfter: after },
  });
  await writeAudit(tx, ctx, {
    action: "TRANSACTION_APPROVED",
    targetType: "transaction",
    targetId: String(input.transactionId),
    before: { balance: before.toFixed(2), status: "PENDING" },
    after: { balance: after.toFixed(2), status: "COMPLETED" },
    reason: input.reason,
  });
  return { before, after };
}

/**
 * Has this key already been applied? The fast path callers check before
 * opening a transaction, so an honest retry costs one indexed read rather than
 * a failed insert. The UNIQUE constraint is still the real guard — see the
 * P2002 handling in callers for the race this cannot catch.
 */
export async function alreadyApplied(idempotencyKey: string): Promise<boolean> {
  const existing = await prisma.transaction.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  return existing !== null;
}

/** True when an error is the UNIQUE(idempotencyKey) collision — i.e. a racing
 * duplicate of a move that did land. Callers report success, not failure. */
export function isDuplicateKey(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
