"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import * as skus from "./service.ts";

export async function attachVariantsAction(productId: number, variantIds: number[]) {
  const actor = await requirePermission("products.manage");
  return withValidation(async () => {
    const result = await skus.attachVariants(actor, { productId, variantIds }, await auditContext(actor));
    revalidatePath(`/admin/products/${productId}/variants`);
    return result;
  });
}

export async function updateSkuAction(productId: number, id: number, input: unknown) {
  const actor = await requirePermission("products.manage");
  return withValidation(async () => {
    const result = await skus.updateSku(actor, id, input, await auditContext(actor));
    revalidatePath(`/admin/products/${productId}/variants`);
    return result;
  });
}

export async function setPricesAction(productId: number, productVariantId: number, prices: unknown) {
  const actor = await requirePermission("products.manage");
  return withValidation(async () => {
    const result = await skus.setPrices(actor, productVariantId, prices, await auditContext(actor));
    revalidatePath(`/admin/products/${productId}/variants`);
    return result;
  });
}

export async function bulkSetPricesAction(productId: number, ids: number[], prices: unknown) {
  const actor = await requirePermission("products.manage");
  return withValidation(async () => {
    const result = await skus.bulkSetPrices(actor, ids, prices, await auditContext(actor));
    revalidatePath(`/admin/products/${productId}/variants`);
    return result;
  });
}

export async function detachSkuAction(productId: number, id: number) {
  const actor = await requirePermission("products.manage");
  const result = await skus.detachSku(actor, id, await auditContext(actor));
  revalidatePath(`/admin/products/${productId}/variants`);
  return result;
}

/** SKUs of one variant for the order form's second dropdown. Unpriced SKUs are
 * excluded for the same reason /catalog hides them: ordering one would charge
 * nothing. */
export async function listSkuOptionsAction(productId: number) {
  const actor = await requirePermission("products.read");
  const rows = await skus.listSkusForProduct(actor, productId);
  return rows
    .filter((s) => s.status === "ACTIVE" && (s.prices.length > 0 || !s.salePrice.isZero()))
    .map((s) => ({ id: s.id, name: s.product.name, sku: s.sku }));
}

/**
 * Resolve spreadsheet SKU references to ids, in one round trip for the whole
 * file.
 *
 * A sheet names a SKU by its code, or by variant+product KEYS (which is what
 * the legacy importer matched on). Resolving server-side keeps the client from
 * ever choosing an id, and returning nulls lets the importer say "column 4: no
 * such SKU" instead of failing the batch.
 */
export async function resolveSkusAction(
  refs: { sku?: string; variant?: string; product?: string }[],
) {
  const actor = await requirePermission("products.read");
  return skus.resolveSkuRefs(actor, refs);
}
