import "server-only";

import { requirePermission } from "../../core/guard.ts";
import { listOrders, refundQuote } from "../../fulfillment/index.ts";

/**
 * The orders a seller could ask for money back on, with what each is worth.
 *
 * Built from fulfillment's own scope and its own quote, so the list a seller
 * ticks is exactly the list the service will accept and the totals are the
 * ones an admin's refund would pay. Capped: the dialog is a picker, not a
 * second orders page.
 */
export async function myRefundableOrders(limit = 50) {
  const actor = await requirePermission("transactions.read.own");
  const { rows } = await listOrders(actor, { pageSize: limit });
  const quote = await refundQuote(
    actor,
    rows.map((o) => o.id),
  );
  const labels = new Map(rows.map((o) => [o.id, o.externalId ?? `#${o.id}`]));

  return quote.lines
    .filter((line) => !line.blocked)
    .map((line) => ({
      id: line.orderId,
      label: labels.get(line.orderId) ?? `#${line.orderId}`,
      total: line.total,
    }));
}
