import { NORMAL_SIDE, projectBalance, reverse, validateTransaction, type Direction, type PostedEntry } from "@orderlane/core/ledger";
import type { LedgerAccountKind, LedgerTransactionKind } from "@orderlane/db";

import type { Ctx } from "../context.ts";
import { ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "../errors.ts";
import { requireRole } from "../identity/tenants.ts";

/**
 * Posting to and reading from the ledger.
 *
 * The invariant lives in @orderlane/core and is checked before anything is
 * written; this module resolves account kinds to rows, writes a transaction
 * and its entries as one unit, and projects balances.
 */

export interface PostingInput {
  /** Kinds, not ids: callers name what an account IS, not which row it happens to be. */
  readonly account: LedgerAccountKind;
  readonly direction: Direction;
  readonly amountMinor: bigint;
}

export interface PostInput {
  readonly kind: LedgerTransactionKind;
  readonly idempotencyKey: string;
  readonly reference?: string | undefined;
  readonly memo?: string | undefined;
  readonly postings: readonly PostingInput[];
}

export interface PostResult {
  readonly transactionId: string;
  /** False when this exact event had already been recorded. */
  readonly created: boolean;
}

async function accountsByKind(ctx: Ctx): Promise<Map<LedgerAccountKind, { id: string; currency: string }>> {
  const rows = await ctx.db.ledgerAccount.findMany({ select: { id: true, kind: true, currency: true } });
  return new Map(rows.map((a) => [a.kind, { id: a.id, currency: a.currency }]));
}

/**
 * Record one economic event.
 *
 * Idempotent by construction: the unique constraint on idempotencyKey is what
 * makes a retried charge post once, and a caller that retries gets
 * `created: false` and the original transaction rather than an error it has to
 * interpret.
 */
export async function post(ctx: Ctx, input: PostInput): Promise<PostResult> {
  requireRole(ctx, "OPERATOR");

  const accounts = await accountsByKind(ctx);
  const currency = accounts.values().next().value?.currency;
  if (!currency) throw new NotFoundError("ledger accounts for tenant", ctx.tenantId);

  const missing = input.postings.filter((p) => !accounts.has(p.account));
  if (missing.length > 0) {
    throw new ValidationError(
      `this tenant has no ${missing.map((m) => m.account).join(", ")} account`,
      missing.map((m) => ({ account: m.account, code: "unknown_account" })),
    );
  }

  const issues = validateTransaction({
    kind: input.kind,
    currency,
    idempotencyKey: input.idempotencyKey,
    postings: input.postings.map((p) => ({
      accountId: accounts.get(p.account)!.id,
      direction: p.direction,
      amountMinor: p.amountMinor,
    })),
  });
  if (issues.length > 0) throw new ValidationError("this posting does not balance", issues);

  try {
    const transaction = await ctx.db.$transaction(async (tx) => {
      const created = await tx.ledgerTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          kind: input.kind,
          idempotencyKey: input.idempotencyKey,
          ...(input.reference ? { reference: input.reference } : {}),
          ...(input.memo ? { memo: input.memo } : {}),
        },
      });

      // Entries and their transaction are one unit. There is no state in which
      // a transaction exists with half its postings — the invariant would be
      // false, and a reader cannot tell "mid-write" from "wrong".
      await tx.ledgerEntry.createMany({
        data: input.postings.map((p) => ({
          tenantId: ctx.tenantId,
          transactionId: created.id,
          accountId: accounts.get(p.account)!.id,
          direction: p.direction,
          amountMinor: p.amountMinor,
        })),
      });

      return created;
    });

    return { transactionId: transaction.id, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const existing = await ctx.db.ledgerTransaction.findFirst({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (!existing) {
      // The key is unique across tenants, so a collision we cannot see is
      // somebody else's — a caller-chosen key that is not tenant-prefixed.
      throw new ConflictError(`idempotency key "${input.idempotencyKey}" is already in use`);
    }
    return { transactionId: existing.id, created: false };
  }
}

/**
 * An account's balance.
 *
 * snapshot + everything since. Without a snapshot this sums every entry, which
 * is also the definition — the cache changes the cost of the answer, never the
 * answer.
 */
export async function balance(ctx: Ctx, kind: LedgerAccountKind): Promise<bigint> {
  const account = await ctx.db.ledgerAccount.findFirst({ where: { kind }, select: { id: true } });
  if (!account) throw new NotFoundError("ledger account", kind);

  const snapshot = await ctx.db.balanceSnapshot.findUnique({ where: { accountId: account.id } });

  const entries = await ctx.db.ledgerEntry.findMany({
    where: { accountId: account.id, ...(snapshot ? { seq: { gt: snapshot.throughSeq } } : {}) },
    orderBy: { seq: "asc" },
    select: { direction: true, amountMinor: true },
  });

  const posted: PostedEntry[] = entries.map((e) => ({
    accountId: account.id,
    accountKind: kind,
    direction: e.direction,
    amountMinor: e.amountMinor,
  }));

  return projectBalance(
    kind,
    posted,
    snapshot ? { amountMinor: snapshot.amountMinor, throughSeq: snapshot.throughSeq } : undefined,
  );
}

/**
 * Advance an account's cached balance.
 *
 * Safe to run at any time, twice, or never. The one thing it must not do is
 * read entries outside the transaction that writes the snapshot, or a posting
 * landing in between would be counted twice.
 */
export async function refreshSnapshot(ctx: Ctx, kind: LedgerAccountKind): Promise<bigint> {
  const account = await ctx.db.ledgerAccount.findFirst({ where: { kind }, select: { id: true } });
  if (!account) throw new NotFoundError("ledger account", kind);

  return ctx.db.$transaction(async (tx) => {
    const existing = await tx.balanceSnapshot.findUnique({ where: { accountId: account.id } });
    const entries = await tx.ledgerEntry.findMany({
      where: { accountId: account.id, ...(existing ? { seq: { gt: existing.throughSeq } } : {}) },
      orderBy: { seq: "asc" },
      select: { seq: true, direction: true, amountMinor: true },
    });

    if (entries.length === 0) return existing?.amountMinor ?? 0n;

    const amountMinor = projectBalance(
      kind,
      entries.map((e) => ({ accountId: account.id, accountKind: kind, direction: e.direction, amountMinor: e.amountMinor })),
      existing ? { amountMinor: existing.amountMinor, throughSeq: existing.throughSeq } : undefined,
    );
    const throughSeq = entries[entries.length - 1]!.seq;

    await tx.balanceSnapshot.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, tenantId: ctx.tenantId, throughSeq, amountMinor },
      update: { throughSeq, amountMinor },
    });

    return amountMinor;
  });
}

// ─── Named events ────────────────────────────────────────────────────────────
// Thin wrappers, but worth having: they put the double-entry reasoning in one
// place per event rather than at every call site, where getting a direction
// backwards would be an easy and expensive mistake.

/** A merchant places funds with the platform. Their wallet (a liability) grows. */
export async function fundWallet(ctx: Ctx, amountMinor: bigint, reference: string): Promise<PostResult> {
  return post(ctx, {
    kind: "WALLET_FUNDING",
    idempotencyKey: `wallet-funding:${ctx.tenantId}:${reference}`,
    reference,
    postings: [
      { account: "TENANT_RECEIVABLE", direction: "DEBIT", amountMinor },
      { account: "TENANT_WALLET", direction: "CREDIT", amountMinor },
    ],
  });
}

/** Work done on an order is charged against the merchant's wallet. */
export async function chargeOrder(ctx: Ctx, orderId: string, amountMinor: bigint): Promise<PostResult> {
  return post(ctx, {
    kind: "ORDER_CHARGE",
    idempotencyKey: `order-charge:${ctx.tenantId}:${orderId}`,
    reference: `order:${orderId}`,
    postings: [
      { account: "TENANT_WALLET", direction: "DEBIT", amountMinor },
      { account: "PLATFORM_REVENUE", direction: "CREDIT", amountMinor },
    ],
  });
}

/**
 * Undo a charge by posting its opposite.
 *
 * Never by editing or deleting the original: the mistake stays visible, which
 * is the only version of the story that survives being asked about a year
 * later.
 */
export async function refundOrder(ctx: Ctx, orderId: string, amountMinor: bigint): Promise<PostResult> {
  const original = [
    { account: "TENANT_WALLET" as const, direction: "DEBIT" as const, amountMinor },
    { account: "PLATFORM_REVENUE" as const, direction: "CREDIT" as const, amountMinor },
  ];
  const reversed = reverse(original.map((p) => ({ accountId: p.account, direction: p.direction, amountMinor: p.amountMinor })));

  return post(ctx, {
    kind: "ORDER_REFUND",
    idempotencyKey: `order-refund:${ctx.tenantId}:${orderId}`,
    reference: `order:${orderId}`,
    postings: reversed.map((p) => ({
      account: p.accountId as LedgerAccountKind,
      direction: p.direction,
      amountMinor: p.amountMinor,
    })),
  });
}

export { NORMAL_SIDE };
