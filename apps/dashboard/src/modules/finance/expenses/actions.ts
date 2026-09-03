"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import { ExpenseError } from "./service.ts";
import * as expenses from "./service.ts";

/** Coded refusals become the {ok:false,error} shape the dialogs render; the
 * detail rides along so "category in use" can say how many entries. */
async function guarded<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ExpenseError) return { ok: false as const, error: e.code, detail: e.detail };
    throw e;
  }
}

const refresh = () => revalidatePath("/admin/expenses");

export async function createEntryAction(input: unknown) {
  const actor = await requirePermission("expenses.manage");
  const ctx = await auditContext(actor);
  const result = await withValidation(() => guarded(() => expenses.createEntry(actor, input, ctx)));
  refresh();
  return result;
}

export async function updateEntryAction(id: number, input: unknown) {
  const actor = await requirePermission("expenses.manage");
  const ctx = await auditContext(actor);
  const result = await withValidation(() =>
    guarded(() => expenses.updateEntry(actor, id, input, ctx)),
  );
  refresh();
  return result;
}

export async function deleteEntryAction(id: number) {
  const actor = await requirePermission("expenses.manage");
  const ctx = await auditContext(actor);
  const result = await guarded(() => expenses.deleteEntry(actor, id, ctx));
  refresh();
  return result;
}

export async function createCategoryAction(input: unknown) {
  const actor = await requirePermission("expenses.manage");
  const ctx = await auditContext(actor);
  const result = await withValidation(() =>
    guarded(() => expenses.createCategory(actor, input, ctx)),
  );
  refresh();
  return result;
}

export async function updateCategoryAction(id: number, input: unknown) {
  const actor = await requirePermission("expenses.manage");
  const ctx = await auditContext(actor);
  const result = await withValidation(() =>
    guarded(() => expenses.updateCategory(actor, id, input, ctx)),
  );
  refresh();
  return result;
}

export async function deleteCategoryAction(id: number) {
  const actor = await requirePermission("expenses.manage");
  const ctx = await auditContext(actor);
  const result = await guarded(() => expenses.deleteCategory(actor, id, ctx));
  refresh();
  return result;
}
