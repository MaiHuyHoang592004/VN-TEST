/**
 * A double-entry ledger, in about a hundred lines.
 *
 * The alternative — a `balance` column updated on each event — has one failure
 * mode that never goes away: the column and the events that produced it are
 * two sources of truth, and the first half-applied write puts them out of
 * step, permanently and silently. Here there is one source of truth (the
 * entries) and everything else is derived, so "the balance is wrong" becomes
 * a question with an answer rather than a mystery with a manual correction.
 */

export type AccountKind =
  | "TENANT_WALLET"
  | "TENANT_RECEIVABLE"
  | "PLATFORM_REVENUE"
  | "PLATFORM_CLEARING";

export type Direction = "DEBIT" | "CREDIT";

export type TransactionKind =
  | "WALLET_FUNDING"
  | "ORDER_CHARGE"
  | "ORDER_REFUND"
  | "SHIPPING_CHARGE"
  | "ADJUSTMENT";

/**
 * Which direction increases an account.
 *
 * TENANT_WALLET is credit-normal because, from the platform's side of the
 * books, a tenant's deposited funds are money owed back to them — a liability.
 * Getting this backwards is the classic double-entry mistake, so it is a table
 * rather than a convention somebody has to remember.
 */
export const NORMAL_SIDE: Readonly<Record<AccountKind, Direction>> = Object.freeze({
  TENANT_WALLET: "CREDIT",
  TENANT_RECEIVABLE: "DEBIT",
  PLATFORM_REVENUE: "CREDIT",
  PLATFORM_CLEARING: "CREDIT",
});

export interface Posting {
  readonly accountId: string;
  readonly direction: Direction;
  /** Always positive. `direction` carries the sign. */
  readonly amountMinor: bigint;
}

export interface DraftTransaction {
  readonly kind: TransactionKind;
  readonly currency: string;
  /** Required. See docs/design/ledger.md on why it is not optional. */
  readonly idempotencyKey: string;
  readonly reference?: string;
  readonly memo?: string;
  readonly postings: readonly Posting[];
}

export interface PostedEntry extends Posting {
  readonly accountKind: AccountKind;
}

export type LedgerIssueCode =
  | "no_postings"
  | "single_sided"
  | "non_positive_amount"
  | "unbalanced"
  | "missing_idempotency_key"
  | "invalid_currency";

export interface LedgerIssue {
  readonly code: LedgerIssueCode;
  readonly message: string;
}
