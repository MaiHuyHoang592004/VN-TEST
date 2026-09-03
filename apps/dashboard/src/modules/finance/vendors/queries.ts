import "server-only";

import { requirePermission } from "../../core/guard.ts";
import type { VendorListQuery } from "./schema.ts";
import * as vendors from "./service.ts";

export async function listVendors(query: VendorListQuery = {}) {
  const actor = await requirePermission("vendors.manage");
  return vendors.listVendors(actor, query);
}

/** The picker on the expenses form. Gated on expenses.manage rather than
 * vendors.manage: choosing a supplier for a receipt is not the same act as
 * maintaining the supplier list, and the two grants only happen to overlap. */
export async function listVendorOptions() {
  const actor = await requirePermission("expenses.manage");
  return vendors.listVendorOptions(actor);
}
