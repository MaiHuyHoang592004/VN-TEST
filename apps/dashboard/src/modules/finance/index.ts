/**
 * finance — the money ledger: transactions, approvals, and later invoicing
 * and payouts.
 *
 * Public surface for other domains (see identity/index.ts for the rule).
 * Note what is NOT here: the balance-moving primitive lives in core/ledger.ts,
 * because identity and fulfillment move money too and a domain may not reach
 * into another to do it.
 */
export { getTransaction, listTransactions } from "./transactions/service.ts";
