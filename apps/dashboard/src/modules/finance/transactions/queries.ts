import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as transactions from "./service.ts";
import type { TransactionListQuery } from "./schema.ts";

/**
 * Gated on transactions.read.own, NOT .all — the SCOPE decides what comes
 * back, so this same function serves the admin ledger and a seller's own
 * history without a second code path to keep in step.
 */
export async function listTransactions(query: TransactionListQuery = {}) {
  const actor = await requirePermission("transactions.read.own");
  return transactions.listTransactions(actor, query);
}

export async function getTransaction(id: number) {
  const actor = await requirePermission("transactions.read.own");
  return transactions.getTransaction(actor, id);
}
