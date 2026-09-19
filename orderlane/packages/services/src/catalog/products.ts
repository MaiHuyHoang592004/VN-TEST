import { z } from "zod";

import type { Product, ProductStatus, Variant } from "@orderlane/db";

import type { Ctx } from "../context.ts";
import { ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "../errors.ts";
import { requireRole } from "../identity/tenants.ts";
import { keysetQuery, toPage, type Page, type PageRequest } from "../keyset.ts";

/**
 * Catalogue. Two levels: a Product a buyer recognises, a Variant a warehouse
 * picks. The SKU is the merchant's own identifier — never generated for them,
 * because it is the join key every spreadsheet they own already uses.
 */

const slug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens only");

const sku = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((s) => s.toUpperCase());

export const createProductInput = z.object({
  slug,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).optional(),
});

export const createVariantInput = z.object({
  sku,
  title: z.string().trim().min(1).max(200),
  priceMinor: z.number().int().min(0),
  options: z.record(z.string()).default({}),
});

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("input is not valid", result.error.issues);
  }
  return result.data;
}

export async function createProduct(ctx: Ctx, input: unknown): Promise<Product> {
  requireRole(ctx, "OPERATOR");
  const data = parse(createProductInput, input);
  try {
    return await ctx.db.product.create({
      data: { tenantId: ctx.tenantId, slug: data.slug, title: data.title, description: data.description ?? null },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`a product with slug "${data.slug}" already exists`);
    throw error;
  }
}

export async function createVariant(ctx: Ctx, productId: string, input: unknown): Promise<Variant> {
  requireRole(ctx, "OPERATOR");
  const data = parse(createVariantInput, input);

  // Checked explicitly so a variant under another tenant's product is a clean
  // 404 rather than a foreign-key error from three layers down.
  const product = await ctx.db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new NotFoundError("product", productId);

  try {
    return await ctx.db.variant.create({
      data: {
        tenantId: ctx.tenantId,
        productId,
        sku: data.sku,
        title: data.title,
        priceMinor: data.priceMinor,
        options: data.options,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`SKU "${data.sku}" is already used in this tenant`);
    throw error;
  }
}

export interface ProductListItem {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly variantCount: number;
  readonly createdAt: Date;
}

export async function listProducts(ctx: Ctx, request: PageRequest = {}): Promise<Page<ProductListItem>> {
  const { take, where } = keysetQuery(request, "createdAt", "desc");
  const rows = await ctx.db.product.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: { _count: { select: { variants: true } } },
  });

  return toPage(
    rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      variantCount: p._count.variants,
      createdAt: p.createdAt,
    })),
    take,
    (row) => row.createdAt,
  );
}

/**
 * SKU → variant, for the importer and the order API.
 *
 * One query for the whole batch rather than one per row: a 500-row import
 * doing 500 lookups is the difference between a second and a minute, and the
 * shape of the answer (a Map, with misses simply absent) is what lets the
 * caller report every unknown SKU at once instead of stopping at the first.
 */
export async function resolveSkus(ctx: Ctx, skus: readonly string[]): Promise<Map<string, { id: string; priceMinor: number; title: string }>> {
  const wanted = [...new Set(skus.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const rows = await ctx.db.variant.findMany({
    where: { sku: { in: wanted } },
    select: { id: true, sku: true, priceMinor: true, title: true },
  });

  return new Map(rows.map((v) => [v.sku, { id: v.id, priceMinor: v.priceMinor, title: v.title }]));
}

export async function setProductStatus(ctx: Ctx, productId: string, status: ProductStatus): Promise<void> {
  requireRole(ctx, "OPERATOR");
  const updated = await ctx.db.product.updateMany({ where: { id: productId }, data: { status } });
  if (updated.count === 0) throw new NotFoundError("product", productId);
}
