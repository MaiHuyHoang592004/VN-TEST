"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import * as suppliers from "./service.ts";

export async function createMaterialAction(input: unknown) {
  const actor = await requirePermission("suppliers.manage");
  const result = await suppliers.createMaterial(actor, input, await auditContext(actor));
  revalidatePath("/admin/materials");
  return result;
}

export async function updateMaterialAction(id: number, input: unknown) {
  const actor = await requirePermission("suppliers.manage");
  const result = await suppliers.updateMaterial(actor, id, input, await auditContext(actor));
  revalidatePath("/admin/materials");
  return result;
}

export async function deleteMaterialAction(id: number) {
  const actor = await requirePermission("suppliers.manage");
  const result = await suppliers.deleteMaterial(actor, id, await auditContext(actor));
  revalidatePath("/admin/materials");
  return result;
}

/** Read-only, but an action because the delete dialog asks before deciding
 * whether to offer delete or explain what is blocking it. */
export async function getMaterialUsageAction(id: number) {
  const actor = await requirePermission("suppliers.manage");
  return suppliers.getMaterialUsage(actor, id);
}

/** Searchable picker source for the adjust and quick-import dialogs. */
export async function searchMaterialsAction(search: string) {
  const actor = await requirePermission("inventory.read");
  return suppliers.listMaterialOptions(actor, search);
}
