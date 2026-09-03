import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as reports from "./service.ts";

/**
 * Every report opens with its own guard, stated here rather than inherited
 * from whatever page happens to call it. The legacy hole was exactly this:
 * the controller trusted "is signed in" and the menu did the rest.
 */
export async function adminReport(range: reports.ReportRange = {}) {
  const actor = await requirePermission("transactions.read.all");
  return reports.adminReport(actor, range);
}

export async function sellerReport(range: reports.ReportRange = {}) {
  const actor = await requirePermission("transactions.read.own");
  return reports.sellerReport(actor, range);
}

export async function warehouseReport(
  range: reports.ReportRange & { warehouseId?: number } = {},
) {
  const actor = await requirePermission("orders.read.customer");
  return reports.warehouseReport(actor, range);
}
