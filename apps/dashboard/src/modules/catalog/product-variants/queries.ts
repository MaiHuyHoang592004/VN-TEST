import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as skus from "./service.ts";
import { effectivePrice } from "./pricing.ts";

export async function listSkusForProduct(productId: number) {
  const actor = await requirePermission("products.read");
  return skus.listSkusForProduct(actor, productId);
}

/** Flat SKU list for pickers (the BOM dialog's product chooser). */
export async function listSkuOptions(search?: string) {
  const actor = await requirePermission("products.read");
  return skus.listSkuOptions(actor, search);
}

export async function listAttachableVariants(productId: number) {
  const actor = await requirePermission("products.manage");
  return skus.listAttachableVariants(actor, productId);
}

/**
 * The catalogue as a SELLER sees it: one price per SKU — theirs.
 *
 * The whole tier table stays on the server; the browser is sent a single
 * resolved figure, so a seller cannot read what another tier pays by opening
 * devtools. Money crosses the wire as a fixed-2 STRING, never a float.
 */
export async function listSkusWithMyPrice(productId: number) {
  const actor = await requirePermission("products.read");
  const [rows, tier] = await Promise.all([
    skus.listSkusForProduct(actor, productId),
    skus.tierOf(actor),
  ]);
  return rows.map(({ prices, ...sku }) => ({
    ...sku,
    salePrice: sku.salePrice.toFixed(2),
    price: effectivePrice({ salePrice: sku.salePrice, prices }, tier).toFixed(2),
    /**
     * Has anyone ever set a price for this SKU?
     *
     * effectivePrice ends at salePrice, which defaults to 0 — so a SKU that was
     * attached and never priced resolves to "0.00", indistinguishable from a
     * deliberate free replacement. That is the same shape as the legacy bug
     * where a null tier produced a free order, and the caller needs to be able
     * to tell the two apart: an unpriced SKU should not be offered for sale,
     * while a genuinely 0.00 one should.
     */
    priced: prices.length > 0 || !sku.salePrice.isZero(),
  }));
}
