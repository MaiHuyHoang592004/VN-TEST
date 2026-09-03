"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import * as products from "./service.ts";

export async function createProductAction(input: unknown) {
  const actor = await requirePermission("products.manage");
  return withValidation(async () => {
    const result = await products.createProduct(actor, input, await auditContext(actor));
    revalidatePath("/admin/products");
    return result;
  });
}

export async function updateProductAction(id: number, input: unknown) {
  const actor = await requirePermission("products.manage");
  return withValidation(async () => {
    const result = await products.updateProduct(actor, id, input, await auditContext(actor));
    revalidatePath("/admin/products");
    return result;
  });
}

export async function setProductStatusAction(
  id: number,
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED",
) {
  const actor = await requirePermission("products.manage");
  const result = await products.setProductStatus(actor, id, status, await auditContext(actor));
  revalidatePath("/admin/products");
  return result;
}

/** Read-only, but exposed as an action because the delete dialog needs it from
 * the client before deciding whether to offer delete or deactivate. */
export async function getProductUsageAction(id: number) {
  const actor = await requirePermission("products.manage");
  return products.getProductUsage(actor, id);
}

export async function deleteProductAction(id: number) {
  const actor = await requirePermission("products.manage");
  const result = await products.deleteProduct(actor, id, await auditContext(actor));
  revalidatePath("/admin/products");
  return result;
}

/**
 * Products a picker can offer, scoped like everything else — a restricted
 * partner is offered only their allow-listed products, so the order form
 * cannot be used to reach around /catalog.
 *
 * products.read, not manage: sellers create orders and need this.
 */
export async function listProductOptionsAction() {
  const actor = await requirePermission("products.read");
  const { rows } = await products.listProducts(actor, { status: "ACTIVE", pageSize: 100 });
  return rows.map((p) => ({ id: p.id, name: p.name, key: p.key }));
}
