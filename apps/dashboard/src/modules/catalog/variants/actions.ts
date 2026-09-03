"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import * as variants from "./service.ts";

export async function createVariantAction(input: unknown) {
  const actor = await requirePermission("products.manage");
  return withValidation(async () => {
    const result = await variants.createVariant(actor, input, await auditContext(actor));
    revalidatePath("/admin/variants");
    return result;
  });
}

export async function updateVariantAction(id: number, input: unknown) {
  const actor = await requirePermission("products.manage");
  return withValidation(async () => {
    const result = await variants.updateVariant(actor, id, input, await auditContext(actor));
    revalidatePath("/admin/variants");
    return result;
  });
}

export async function setVariantStatusAction(
  id: number,
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED",
) {
  const actor = await requirePermission("products.manage");
  const result = await variants.setVariantStatus(actor, id, status, await auditContext(actor));
  revalidatePath("/admin/variants");
  return result;
}

export async function getVariantUsageAction(id: number) {
  const actor = await requirePermission("products.manage");
  return variants.getVariantUsage(actor, id);
}

export async function deleteVariantAction(id: number) {
  const actor = await requirePermission("products.manage");
  const result = await variants.deleteVariant(actor, id, await auditContext(actor));
  revalidatePath("/admin/variants");
  return result;
}
