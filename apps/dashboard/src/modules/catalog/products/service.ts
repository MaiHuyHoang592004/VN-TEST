/**
 * Product catalogue logic. Transport-agnostic — takes an explicit actor.
 *
 * A variant referenced by orders or SKUs is NEVER hard-deleted: it is
 * soft-deleted so historical orders keep resolving their variant name, and the
 * usage counts below drive the same "deactivate instead" dialog warehouses use.
 */
import {
  prisma,
  writeAudit,
  productScope,
  PRODUCT_SELECT,
  Prisma,
  type AuditContext,
} from "@opcreative/db";

import { productSchema } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;

export type ProductListQuery = {
  search?: string;
  status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
  page?: number;
  pageSize?: number;
};

/**
 * The catalogue as `actor` may see it. The scope is spread FIRST so a
 * restricted partner's allow-list cannot be widened by any filter added below
 * — the rule scopes.ts exists to enforce.
 */
export async function listProducts(actor: Actor, query: ProductListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where: Prisma.ProductWhereInput = {
    ...(await productScope(actor)),
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { key: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.variant.findMany({
      where,
      select: { ...PRODUCT_SELECT, _count: { select: { variants: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.variant.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

/** One variant, scoped — so a restricted partner cannot read a variant they
 * were never granted by guessing its id. */
export async function getProduct(actor: Actor, id: number) {
  return prisma.variant.findFirstOrThrow({
    where: { ...(await productScope(actor)), id, deletedAt: null },
    select: PRODUCT_SELECT,
  });
}

function toData(input: ReturnType<typeof productSchema.parse>) {
  return {
    name: input.name,
    key: input.key,
    thumbnail: input.thumbnail && input.thumbnail.length ? input.thumbnail : null,
    status: input.status,
  };
}

export async function createProduct(actor: Actor, raw: unknown, ctx: AuditContext) {
  const data = toData(productSchema.parse(raw));
  try {
    const variant = await prisma.$transaction(async (tx) => {
      const created = await tx.variant.create({ data, select: { id: true, name: true, key: true } });
      await writeAudit(tx, ctx, {
        action: "PRODUCT_CREATED",
        targetType: "variant",
        targetId: String(created.id),
        after: { name: created.name, key: created.key },
      });
      return created;
    });
    return { ok: true as const, id: variant.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, error: "key-taken" as const };
    }
    throw e;
  }
}

export async function updateProduct(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const data = toData(productSchema.parse(raw));
  const before = await prisma.variant.findFirstOrThrow({
    where: { id, deletedAt: null },
    select: PRODUCT_SELECT,
  });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.variant.update({ where: { id }, data });
      await writeAudit(tx, ctx, {
        action: "PRODUCT_UPDATED",
        targetType: "variant",
        targetId: String(id),
        before,
        after: data,
      });
    });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false as const, error: "key-taken" as const };
    }
    throw e;
  }
}

export async function setProductStatus(
  actor: Actor,
  id: number,
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED",
  ctx: AuditContext,
) {
  await prisma.$transaction(async (tx) => {
    await tx.variant.update({ where: { id }, data: { status } });
    await writeAudit(tx, ctx, {
      action: "PRODUCT_STATUS_CHANGED",
      targetType: "variant",
      targetId: String(id),
      after: { status },
    });
  });
  return { ok: true as const };
}

/** Counts of everything pointing at the variant — drives canDelete and the
 * "used by" pills in the delete dialog. */
export async function getProductUsage(_actor: Actor, id: number) {
  const [skus, orders, allowedUsers] = await Promise.all([
    prisma.productVariant.count({ where: { productId: id, deletedAt: null } }),
    prisma.order.count({ where: { productId: id } }),
    prisma.userAllowedProduct.count({ where: { productId: id } }),
  ]);
  return { skus, orders, allowedUsers, canDelete: skus + orders + allowedUsers === 0 };
}

/**
 * Soft delete. Even an unused variant keeps its column: `key` is unique, and a
 * hard delete would let someone recreate the key and silently inherit the
 * identity of the old one in the audit trail.
 */
export async function deleteProduct(actor: Actor, id: number, ctx: AuditContext) {
  const usage = await getProductUsage(actor, id);
  if (!usage.canDelete) return { ok: false as const, error: "in-use" as const, usage };
  await prisma.$transaction(async (tx) => {
    await tx.variant.update({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    });
    await writeAudit(tx, ctx, {
      action: "PRODUCT_DELETED",
      targetType: "variant",
      targetId: String(id),
      after: { deleted: true },
    });
  });
  return { ok: true as const };
}
