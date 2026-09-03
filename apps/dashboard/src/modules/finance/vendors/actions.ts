"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import * as vendors from "./service.ts";

const refresh = () => {
  revalidatePath("/admin/vendors");
  revalidatePath("/admin/expenses");
};

export async function createVendorAction(input: unknown) {
  const actor = await requirePermission("vendors.manage");
  const ctx = await auditContext(actor);
  const result = await withValidation(() => vendors.createVendor(actor, input, ctx));
  refresh();
  return result;
}

export async function updateVendorAction(id: number, input: unknown) {
  const actor = await requirePermission("vendors.manage");
  const ctx = await auditContext(actor);
  const result = await withValidation(() => vendors.updateVendor(actor, id, input, ctx));
  refresh();
  return result;
}

/** Deletes when nothing points at the vendor, deactivates when something does.
 * The result says which, so the toast can tell the truth. */
export async function deleteVendorAction(id: number) {
  const actor = await requirePermission("vendors.manage");
  const result = await vendors.deleteVendor(actor, id, await auditContext(actor));
  refresh();
  return result;
}
