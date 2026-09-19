import { NORMAL_SIDE, type AccountKind, type DraftTransaction, type LedgerIssue, type PostedEntry, type Posting } from "./types.ts";

/** Thrown only by assertBalanced; validate() returns issues instead. */
export class UnbalancedTransactionError extends Error {
  readonly deltaMinor: bigint;
  constructor(deltaMinor: bigint) {
    super(`transaction is out by ${deltaMinor} minor units (debits minus credits)`);
    this.name = "UnbalancedTransactionError";
    this.deltaMinor = deltaMinor;
  }
}

export function totalFor(postings: readonly Posting[], direction: "DEBIT" | "CREDIT"): bigint {
  let total = 0n;
  for (const p of postings) if (p.direction === direction) total += p.amountMinor;
  return total;
}

/** Debits minus credits. Zero for a well-formed transaction. */
export function imbalance(postings: readonly Posting[]): bigint {
  return totalFor(postings, "DEBIT") - totalFor(postings, "CREDIT");
}

/**
 * The invariant. Called inside the same database transaction that writes the
 * entries, so an unbalanced posting cannot be committed even if a caller
 * builds one.
 */
export function assertBalanced(postings: readonly Posting[]): void {
  const delta = imbalance(postings);
  if (delta !== 0n) throw new UnbalancedTransactionError(delta);
}

/**
 * Everything wrong with a draft, at once — the same reasoning as the workflow
 * guards: a caller fixing a posting should not have to submit four times to
 * find four problems.
 */
export function validateTransaction(draft: DraftTransaction): LedgerIssue[] {
  const issues: LedgerIssue[] = [];

  if (!draft.idempotencyKey) {
    issues.push({ code: "missing_idempotency_key", message: "every transaction names the event it records" });
  }
  if (!/^[A-Z]{3}$/.test(draft.currency)) {
    issues.push({ code: "invalid_currency", message: `"${draft.currency}" is not an ISO 4217 alpha-3 code` });
  }
  if (draft.postings.length === 0) {
    issues.push({ code: "no_postings", message: "a transaction with no postings records nothing" });
    return issues;
  }
  for (const p of draft.postings) {
    if (p.amountMinor <= 0n) {
      issues.push({
        code: "non_positive_amount",
        message: `posting to ${p.accountId} has amount ${p.amountMinor}; direction carries the sign, amounts are positive`,
      });
    }
  }
  const hasDebit = draft.postings.some((p) => p.direction === "DEBIT");
  const hasCredit = draft.postings.some((p) => p.direction === "CREDIT");
  if (!hasDebit || !hasCredit) {
    issues.push({ code: "single_sided", message: "a posting needs both a debit and a credit side" });
  }
  const delta = imbalance(draft.postings);
  if (delta !== 0n) {
    issues.push({ code: "unbalanced", message: `debits exceed credits by ${delta} minor units` });
  }
  return issues;
}

/**
 * A correction is a new, opposite transaction — never an edit or a delete.
 * The mistake stays visible, which is the only version of the story that
 * survives somebody asking about it later.
 */
export function reverse(postings: readonly Posting[]): Posting[] {
  return postings.map((p) => ({
    accountId: p.accountId,
    direction: p.direction === "DEBIT" ? ("CREDIT" as const) : ("DEBIT" as const),
    amountMinor: p.amountMinor,
  }));
}

/** One entry's contribution to its account's balance, signed by normal side. */
export function signedAmount(entry: PostedEntry): bigint {
  return entry.direction === NORMAL_SIDE[entry.accountKind] ? entry.amountMinor : -entry.amountMinor;
}

export interface BalanceSnapshot {
  readonly amountMinor: bigint;
  /** Entries at or before this id are already counted in amountMinor. */
  readonly throughEntryId: string;
}

/**
 * Balance = snapshot + everything since. With no snapshot it is the sum of all
 * entries, which is also the definition — the snapshot only changes how long
 * the answer takes, never what it is. That is deliberate: the cache can be
 * dropped, rebuilt or ignored without any risk of changing a number.
 */
export function projectBalance(
  accountKind: AccountKind,
  entriesAfterSnapshot: readonly PostedEntry[],
  snapshot?: BalanceSnapshot,
): bigint {
  let total = snapshot?.amountMinor ?? 0n;
  for (const entry of entriesAfterSnapshot) {
    if (entry.accountKind !== accountKind) {
      throw new TypeError(`entry belongs to ${entry.accountKind}, expected ${accountKind}`);
    }
    total += signedAmount(entry);
  }
  return total;
}
