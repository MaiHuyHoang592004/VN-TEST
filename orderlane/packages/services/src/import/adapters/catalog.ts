import type { ParsedRow, RowIssue, RowValues } from "@orderlane/core/import";

import type { TenantTx } from "@orderlane/db";

import type { Ctx } from "../../context.ts";
import type { PersistedImportAdapter } from "../adapter.ts";

/**
 * Catalogue import: one row is one variant, with the product it belongs to
 * named inline. A merchant's catalogue spreadsheet has that shape because a
 * person maintains it, and asking them to normalise it first is asking them
 * not to use the feature.
 */

export interface CatalogRow extends RowValues {
  readonly productSlug: string;
  readonly productTitle: string;
  readonly sku: string;
  readonly variantTitle: string;
  readonly priceMinor: number;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Prices arrive as "12.50", "12,50", "$12.50" or 12.5 depending on who made
 * the file. Parsed to minor units here, once, so nothing downstream sees a
 * decimal — and anything that is not recognisably a price is reported rather
 * than coerced to NaN.
 */
export function parsePriceMinor(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  }
  const text = String(raw ?? "").trim().replace(/[^\d,.-]/g, "");
  if (text === "") return null;
  // A single comma with two digits after it is a decimal comma; otherwise
  // commas are thousands separators.
  const normalized = /,\d{1,2}$/.test(text) ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export const catalogAdapter: PersistedImportAdapter<CatalogRow> = {
  kind: "CATALOG",
  columns: ["product_slug", "product_title", "sku", "variant_title", "price"],
  hashFields: ["productSlug", "productTitle", "sku", "variantTitle", "priceMinor"],

  identityOf: (values) => values.sku,

  parse(raw, lineNumber): ParsedRow<CatalogRow> {
    const issues: RowIssue[] = [];

    const productSlug = String(raw["product_slug"] ?? "").trim().toLowerCase();
    const productTitle = String(raw["product_title"] ?? "").trim();
    const sku = String(raw["sku"] ?? "").trim().toUpperCase();
    const variantTitle = String(raw["variant_title"] ?? "").trim();
    const priceMinor = parsePriceMinor(raw["price"]);

    if (!productSlug) issues.push({ field: "product_slug", code: "required", message: "a product slug is required" });
    else if (!SLUG.test(productSlug)) {
      issues.push({ field: "product_slug", code: "invalid_slug", message: `"${productSlug}" must be lowercase letters, digits and single hyphens` });
    }
    if (!productTitle) issues.push({ field: "product_title", code: "required", message: "a product title is required" });
    if (!sku) issues.push({ field: "sku", code: "required", message: "a SKU is required" });
    if (!variantTitle) issues.push({ field: "variant_title", code: "required", message: "a variant title is required" });
    if (priceMinor === null) issues.push({ field: "price", code: "invalid_price", message: `"${String(raw["price"] ?? "")}" is not a price` });
    else if (priceMinor < 0) issues.push({ field: "price", code: "negative_price", message: "a price cannot be negative" });

    if (issues.length > 0) return { lineNumber, raw, issues };
    return { lineNumber, raw, issues: [], values: { productSlug, productTitle, sku, variantTitle, priceMinor: priceMinor! } };
  },

  async apply(tx: TenantTx, ctx: Ctx, values: CatalogRow): Promise<string> {
    const product = await tx.product.upsert({
      where: { tenantId_slug: { tenantId: ctx.tenantId, slug: values.productSlug } },
      create: { tenantId: ctx.tenantId, slug: values.productSlug, title: values.productTitle },
      update: { title: values.productTitle },
    });

    const variant = await tx.variant.upsert({
      where: { tenantId_sku: { tenantId: ctx.tenantId, sku: values.sku } },
      create: {
        tenantId: ctx.tenantId,
        productId: product.id,
        sku: values.sku,
        title: values.variantTitle,
        priceMinor: values.priceMinor,
      },
      update: { title: values.variantTitle, priceMinor: values.priceMinor, productId: product.id },
    });

    return variant.id;
  },
};
