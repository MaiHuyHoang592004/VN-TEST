/**
 * Variant axis values ("Brown", "Large"), shared across products.
 *
 * Same shape as products/service.ts by design, minus the scope: variants carry
 * no partner allow-list because they are meaningless on their own — isolation
 * happens at the product and SKU level, which is what a partner is granted.
 */
import {
  prisma,
  writeAudit,
  VARIANT_SELECT,
  Prisma,
  type AuditContext,
} from "@opcreative/db";

import { variantSchema } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;

export type VariantListQuery = {
  search?: string;
  status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
  page?: number;
  pageSize?: number;
};

export async function listVariants(_actor: Actor, query: VariantListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where: Prisma.VariantWhereInput = {
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
      select: { ...VARIANT_SELECT, _count: { select: { productVariants: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.variant.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export function getVariant(_actor: Actor, id: number) {
  return prisma.variant.findFirstOrThrow({
    where: { id, deletedAt: null },
    select: VARIANT_SELECT,
  });
}

function toData(input: ReturnType<typeof variantSchema.parse>) {
  return { name: input.name, key: input.key, status: input.status };
}

export async function createVariant(actor: Actor, raw: unknown, ctx: AuditContext) {
  const data = toData(variantSchema.parse(raw));
  try {
    const variant = await prisma.$transaction(async (tx) => {
      const created = await tx.variant.create({ data, select: { id: true, name: true, key: true } });
      await writeAudit(tx, ctx, {
        action: "VARIANT_CREATED",
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

export async function updateVariant(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const data = toData(variantSchema.parse(raw));
  const before = await prisma.variant.findFirstOrThrow({
    where: { id, deletedAt: null },
    select: VARIANT_SELECT,
  });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.variant.update({ where: { id }, data });
      await writeAudit(tx, ctx, {
        action: "VARIANT_UPDATED",
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

export async function setVariantStatus(
  actor: Actor,
  id: number,
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED",
  ctx: AuditContext,
) {
  await prisma.$transaction(async (tx) => {
    await tx.variant.update({ where: { id }, data: { status } });
    await writeAudit(tx, ctx, {
      action: "VARIANT_STATUS_CHANGED",
      targetType: "variant",
      targetId: String(id),
      after: { status },
    });
  });
  return { ok: true as const };
}

/** A variant is "in use" once any SKU attaches it to a product. Orders point at
 * the variant too, so both are counted. */
export async function getVariantUsage(_actor: Actor, id: number) {
  const [skus, orders] = await Promise.all([
    prisma.productVariant.count({ where: { variantId: id, deletedAt: null } }),
    prisma.order.count({ where: { variantId: id } }),
  ]);
  return { skus, orders, canDelete: skus + orders === 0 };
}

export async function deleteVariant(actor: Actor, id: number, ctx: AuditContext) {
  const usage = await getVariantUsage(actor, id);
  if (!usage.canDelete) return { ok: false as const, error: "in-use" as const, usage };
  await prisma.$transaction(async (tx) => {
    await tx.variant.update({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    });
    await writeAudit(tx, ctx, {
      action: "VARIANT_DELETED",
      targetType: "variant",
      targetId: String(id),
      after: { deleted: true },
    });
  });
  return { ok: true as const };
}
