"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import * as transactions from "./service.ts";

export async function approveTransactionAction(id: number) {
  const actor = await requirePermission("transactions.approve");
  const result = await transactions.approveTransaction(actor, id, await auditContext(actor));
  revalidatePath("/admin/transactions");
  revalidatePath("/profile/billing");
  return result;
}

export async function rejectTransactionAction(id: number, input: unknown) {
  const actor = await requirePermission("transactions.approve");
  return withValidation(async () => {
    const result = await transactions.rejectTransaction(actor, id, input, await auditContext(actor));
    revalidatePath("/admin/transactions");
    revalidatePath("/profile/billing");
    return result;
  });
}
