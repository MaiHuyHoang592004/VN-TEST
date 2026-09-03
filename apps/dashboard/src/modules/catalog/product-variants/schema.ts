import { z } from "zod";

/**
 * A catalogue price. Same shape as core's moneyAmountSchema but ZERO IS
 * ALLOWED: a free replacement or a sample is a legitimate price, whereas a
 * zero top-up is a mistake. Kept as a STRING end to end so the value reaches
 * Prisma.Decimal without ever being a JS float.
 */
export const priceSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a price like 12.50");

/** tier 0 is the base/public price; 1-4 match User.tier. */
export const tierSchema = z.number().int().min(0).max(4);

export const skuUpdateSchema = z.object({
  // The seller-facing SKU code. Optional, but UNIQUE when present, so blank
  // must become null rather than "" — two empty strings would collide.
  sku: z.string().trim().max(64).optional().or(z.literal("")),
  position: z.string().trim().max(64).optional().or(z.literal("")),
  salePrice: priceSchema,
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

/**
 * The tier table for one SKU. Tier 0 is REQUIRED: it is what every fallback in
 * pricing.ts ultimately lands on, so a SKU without it silently bills salePrice.
 */
export const setPricesSchema = z
  .array(z.object({ tier: tierSchema, price: priceSchema }))
  .min(1, "At least the base price is required")
  .refine((rows) => rows.some((r) => r.tier === 0), "A base price (tier 0) is required")
  .refine(
    (rows) => new Set(rows.map((r) => r.tier)).size === rows.length,
    "Each tier may only appear once",
  );

export const attachVariantsSchema = z.object({
  productId: z.number().int().positive(),
  variantIds: z.array(z.number().int().positive()).min(1, "Select at least one product"),
});

export type SkuUpdateInput = z.infer<typeof skuUpdateSchema>;
export type SetPricesInput = z.infer<typeof setPricesSchema>;
