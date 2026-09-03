/**
 * SKUs — the sellable Product × Variant rows — and their tier prices.
 *
 * This is where the catalogue meets money: setPrices writes the rows that
 * pricing.ts reads and Phase B charges through. Prices are written as strings
 * straight into Prisma.Decimal; nothing here converts a price to a JS number.
 */
import {
  prisma,
  writeAudit,
  productScope,
  SKU_SELECT,
  Prisma,
  type AuditContext,
} from "@opcreative/db";

import { attachVariantsSchema, setPricesSchema, skuUpdateSchema } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;
const blankToNull = (v?: string) => (v && v.length ? v : null);

/**
 * The SKUs of one variant, with their tier prices, scoped through the variant
 * so a restricted partner cannot enumerate a catalogue they were not granted.
 * Throws if the variant is outside their allow-list — the same guarantee
 * getProduct gives.
 */
export async function listSkusForProduct(actor: Actor, productId: number) {
  await prisma.variant.findFirstOrThrow({
    where: { ...(await productScope(actor)), id: productId, deletedAt: null },
    select: { id: true },
  });
  return prisma.productVariant.findMany({
    where: { productId, deletedAt: null },
    select: SKU_SELECT,
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

/**
 * A flat list of SKUs for a picker — the BOM dialog's "which product is this
 * recipe for?", and anything else that needs to name one without knowing its
 * variant first.
 *
 * Scoped through the variant like every other catalogue read, so a restricted
 * partner cannot enumerate SKUs they were never granted. Capped at 50 with a
 * search rather than paged: a picker that returns everything is a picker
 * nobody can use.
 */
export async function listSkuOptions(actor: Actor, search?: string) {
  const rows = await prisma.productVariant.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      variant: { ...(await productScope(actor)), deletedAt: null },
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: "insensitive" as const } },
              { variant: { name: { contains: search, mode: "insensitive" as const } } },
              { product: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      sku: true,
      variant: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: { id: "asc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: `${r.variant.name} · ${r.product.name}`,
  }));
}

/**
 * The actor's pricing tier. Read from the database by id, never taken as an
 * argument: a price a client can request by tier number is a price any client
 * can request. Null (untiered) resolves to the base price in pricing.ts.
 */
export async function tierOf(actor: Actor): Promise<number | null> {
  const u = await prisma.user.findUnique({ where: { id: actor.id }, select: { tier: true } });
  return u?.tier ?? null;
}

/** Variants not yet attached to this variant — the "attach" dialog's list. */
export async function listAttachableVariants(_actor: Actor, productId: number) {
  const attached = await prisma.productVariant.findMany({
    where: { productId, deletedAt: null },
    select: { variantId: true },
  });
  return prisma.product.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      id: { notIn: attached.map((a) => a.variantId) },
    },
    select: { id: true, name: true, key: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Create the missing Product × Variant rows, skipping ones that already exist.
 *
 * ponytail: "already exists" is a read-then-write check, not a unique
 * constraint — ProductVariant deliberately has no @@unique([productId,
 * variantId]) yet because legacy data may contain duplicates (see the model).
 * Ceiling: two admins attaching the same product at the same instant can both
 * pass the check and create a duplicate. Upgrade path is the unique constraint
 * after the cutover audit, at which point this becomes a plain skipDuplicates
 * createMany and the check goes away.
 */
export async function attachVariants(actor: Actor, raw: unknown, ctx: AuditContext) {
  const { productId, variantIds } = attachVariantsSchema.parse(raw);
  const existing = await prisma.productVariant.findMany({
    where: { productId, variantId: { in: variantIds }, deletedAt: null },
    select: { variantId: true },
  });
  const skip = new Set(existing.map((e) => e.variantId));
  const toCreate = variantIds.filter((id) => !skip.has(id));
  if (!toCreate.length) return { ok: true as const, created: 0, skipped: skip.size };

  await prisma.$transaction(async (tx) => {
    await tx.productVariant.createMany({
      data: toCreate.map((variantId) => ({ productId, variantId })),
    });
    await writeAudit(tx, ctx, {
      action: "SKU_ATTACHED",
      targetType: "variant",
      targetId: String(productId),
      after: { variantIds: toCreate },
    });
  });
  return { ok: true as const, created: toCreate.length, skipped: skip.size };
}

export async function updateSku(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const input = skuUpdateSchema.parse(raw);
  const before = await prisma.productVariant.findFirstOrThrow({
    where: { id, deletedAt: null },
    select: { sku: true, position: true, salePrice: true, status: true },
  });
  const data = {
    sku: blankToNull(input.sku),
    position: blankToNull(input.position),
    salePrice: new Prisma.Decimal(input.salePrice),
    status: input.status,
  };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id }, data });
      await writeAudit(tx, ctx, {
        action: "SKU_UPDATED",
        targetType: "sku",
        targetId: String(id),
        before: { ...before, salePrice: before.salePrice.toFixed(2) },
        after: { ...data, salePrice: data.salePrice.toFixed(2) },
      });
    });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, error: "sku-taken" as const };
    }
    throw e;
  }
}

/**
 * Replace the tier table for one SKU, in ONE transaction.
 *
 * Tiers absent from `raw` are DELETED, not left behind: the editor shows the
 * whole table at once, so a tier the admin cleared must stop existing rather
 * than linger and keep being charged. Upsert + delete-the-rest is what makes
 * what you see the thing that is saved.
 */
export async function setPrices(actor: Actor, productVariantId: number, raw: unknown, ctx: AuditContext) {
  const rows = setPricesSchema.parse(raw);
  const before = await prisma.variantPrice.findMany({
    where: { productVariantId },
    select: { tier: true, price: true },
    orderBy: { tier: "asc" },
  });
  await prisma.$transaction(async (tx) => {
    for (const column of rows) {
      const price = new Prisma.Decimal(column.price);
      await tx.variantPrice.upsert({
        where: { productVariantId_tier: { productVariantId, tier: column.tier } },
        create: { productVariantId, tier: column.tier, price },
        update: { price },
      });
    }
    await tx.variantPrice.deleteMany({
      where: { productVariantId, tier: { notIn: rows.map((r) => r.tier) } },
    });
    await writeAudit(tx, ctx, {
      action: "SKU_PRICES_UPDATED",
      targetType: "sku",
      targetId: String(productVariantId),
      before: before.map((b) => ({ tier: b.tier, price: b.price.toFixed(2) })),
      after: rows,
    });
  });
  return { ok: true as const };
}

/**
 * The same tier table across many SKUs — the select-many-fill-once flow the
 * legacy grid had.
 *
 * One transaction for the WHOLE batch, so a failure half way through cannot
 * leave some SKUs repriced and others not. ponytail: sequential upserts inside
 * it, O(skus × tiers) round trips. Ceiling is a few hundred SKUs; if the grid
 * ever bulk-prices thousands, this becomes createMany + a single deleteMany.
 */
export async function bulkSetPrices(
  actor: Actor,
  productVariantIds: number[],
  raw: unknown,
  ctx: AuditContext,
) {
  const rows = setPricesSchema.parse(raw);
  const ids = [...new Set(productVariantIds)];
  if (!ids.length) return { ok: true as const, updated: 0 };

  await prisma.$transaction(async (tx) => {
    for (const productVariantId of ids) {
      for (const column of rows) {
        const price = new Prisma.Decimal(column.price);
        await tx.variantPrice.upsert({
          where: { productVariantId_tier: { productVariantId, tier: column.tier } },
          create: { productVariantId, tier: column.tier, price },
          update: { price },
        });
      }
      await tx.variantPrice.deleteMany({
        where: { productVariantId, tier: { notIn: rows.map((r) => r.tier) } },
      });
    }
    await writeAudit(tx, ctx, {
      action: "SKU_PRICES_UPDATED",
      targetType: "sku",
      targetId: ids.join(","),
      after: { productVariantIds: ids, prices: rows },
    });
  });
  return { ok: true as const, updated: ids.length };
}

/**
 * Detach a SKU that was never ordered — a real delete, and only then.
 *
 * Retiring a SKU with orders behind it is `status: INACTIVE`, not this: those
 * orders point at the column and must keep resolving. That split is what lets
 * @@unique([productId, variantId]) be added later without a data cleanup —
 * a detached SKU leaves nothing behind to collide with when the same product
 * is attached again, which a soft-delete tombstone would.
 */
export async function detachSku(actor: Actor, id: number, ctx: AuditContext) {
  const orders = await prisma.order.count({ where: { productVariantId: id } });
  if (orders > 0) return { ok: false as const, error: "in-use" as const, orders };
  await prisma.$transaction(async (tx) => {
    await tx.variantPrice.deleteMany({ where: { productVariantId: id } });
    await tx.productVariant.delete({ where: { id } });
    await writeAudit(tx, ctx, {
      action: "SKU_UPDATED",
      targetType: "sku",
      targetId: String(id),
      after: { detached: true },
    });
  });
  return { ok: true as const };
}

/**
 * Map spreadsheet references to SKU ids. Scoped through the variant, so a
 * restricted partner cannot import against a variant they were never granted —
 * the importer is not a way around the allow-list.
 */
export async function resolveSkuRefs(
  actor: Actor,
  refs: { sku?: string; variant?: string; product?: string }[],
): Promise<(number | null)[]> {
  const scope = await productScope(actor);
  const codes = refs.map((r) => r.sku?.trim()).filter((c): c is string => !!c);
  const pairs = refs
    .filter((r) => !r.sku?.trim() && r.variant?.trim() && r.product?.trim())
    .map((r) => ({ variant: r.variant!.trim().toLowerCase(), product: r.product!.trim().toLowerCase() }));

  const [byCode, byPair] = await Promise.all([
    codes.length
      ? prisma.productVariant.findMany({
          where: { sku: { in: codes }, deletedAt: null, status: "ACTIVE", variant: { ...scope, deletedAt: null } },
          select: { id: true, sku: true },
        })
      : [],
    pairs.length
      ? prisma.productVariant.findMany({
          where: {
            deletedAt: null,
            status: "ACTIVE",
            variant: { ...scope, deletedAt: null, key: { in: pairs.map((p) => p.variant) } },
            product: { key: { in: pairs.map((p) => p.product) } },
          },
          select: { id: true, variant: { select: { key: true } }, product: { select: { key: true } } },
        })
      : [],
  ]);

  const codeMap = new Map(byCode.map((r) => [r.sku, r.id]));
  const pairMap = new Map(byPair.map((r) => [`${r.variant.key}::${r.product.key}`, r.id]));

  return refs.map((r) => {
    const code = r.sku?.trim();
    if (code) return codeMap.get(code) ?? null;
    const p = r.variant?.trim().toLowerCase();
    const v = r.product?.trim().toLowerCase();
    return p && v ? (pairMap.get(`${p}::${v}`) ?? null) : null;
  });
}
