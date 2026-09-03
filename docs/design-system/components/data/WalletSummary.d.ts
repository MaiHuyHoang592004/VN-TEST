/**
 * Wallet / finance summary strip. Amounts render in mono because they are
 * transactional truth.
 *
 * ── DOMAIN-BOUND ──────────────────────────────────────────────────────
 * NOT VERIFIED. Wallet and accounting semantics were not confirmed against the
 * backend: what "available" vs "pending" balance means, how fees accrue, payout
 * timing and eligibility, currency and rounding. A `transaction` module exists
 * in the codebase, but its balance model was not read.
 *
 * This component is a visual container only. Label each figure exactly as the
 * backend reports it; do not derive, sum or reconcile figures here, and do not
 * add a balance type the backend does not return.
 * ───────────────────────────────────────────────────────────────
 */
export interface WalletSummaryItem {
  label: string;
  /** Pre-formatted amount string including currency, e.g. "$2,485.50". */
  amount: string;
  note?: string;
  tone?: "action" | "progress" | "success" | "neutral";
}
export interface WalletSummaryProps {
  /** Up to four figures. */
  items?: WalletSummaryItem[];
  /** Buttons row under the figures — "Add Funds", "Request Payout". */
  actions?: React.ReactNode;
}
export function WalletSummary(props: WalletSummaryProps): JSX.Element;
