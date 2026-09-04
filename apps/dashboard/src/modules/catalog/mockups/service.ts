/**
 * Mockups — the print/design files orders point at.
 *
 * Gated by mockups.manage, NOT products.manage: customer admins and support
 * fix a bad mockup routinely, and that must not hand them the variant
 * catalogue or its prices (see permissions.ts).
 *
 * Unlike Product and Variant, Mockup has no deletedAt row, so delete here is
 * a real delete and is refused outright once an order references the column —
 * there is no soft-delete tombstone to fall back on.
 */
import {
  prisma,
  writeAudit,
  MOCKUP_SELECT,
  Prisma,
  type AuditContext,
} from "@gwprint/db";

import { mockupSchema } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;

export type MockupListQuery = {
  search?: string;
  status?: "active" | "inactive";
  page?: number;
  pageSize?: number;
};

export async function listMockups(_actor: Actor, query: MockupListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where: Prisma.MockupWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { url: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.mockup.findMany({
      where,
      select: { ...MOCKUP_SELECT, _count: { select: { orders: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mockup.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export function getMockup(_actor: Actor, id: number) {
  return prisma.mockup.findUniqueOrThrow({ where: { id }, select: MOCKUP_SELECT });
}

function toData(input: ReturnType<typeof mockupSchema.parse>) {
  return {
    name: input.name,
    url: input.url,
    thumbnail: input.thumbnail && input.thumbnail.length ? input.thumbnail : null,
    folderId: input.folderId && input.folderId.length ? input.folderId : null,
    status: input.status,
  };
}

export async function createMockup(actor: Actor, raw: unknown, ctx: AuditContext) {
  const data = toData(mockupSchema.parse(raw));
  const mockup = await prisma.$transaction(async (tx) => {
    const created = await tx.mockup.create({ data, select: { id: true, name: true } });
    await writeAudit(tx, ctx, {
      action: "MOCKUP_CREATED",
      targetType: "mockup",
      targetId: String(created.id),
      after: { name: created.name, url: data.url },
    });
    return created;
  });
  return { ok: true as const, id: mockup.id };
}

export async function updateMockup(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const data = toData(mockupSchema.parse(raw));
  const before = await prisma.mockup.findUniqueOrThrow({ where: { id }, select: MOCKUP_SELECT });
  await prisma.$transaction(async (tx) => {
    await tx.mockup.update({ where: { id }, data });
    await writeAudit(tx, ctx, {
      action: "MOCKUP_UPDATED",
      targetType: "mockup",
      targetId: String(id),
      before,
      after: data,
    });
  });
  return { ok: true as const };
}

/** Orders are the only thing pointing at a mockup today. */
export async function getMockupUsage(_actor: Actor, id: number) {
  const orders = await prisma.order.count({ where: { mockupId: id } });
  return { orders, canDelete: orders === 0 };
}

/**
 * Hard delete, and only when nothing references it. Deactivating is the answer
 * for a mockup that has shipped orders behind it — those orders must keep
 * resolving the artwork they were produced from.
 */
export async function deleteMockup(actor: Actor, id: number, ctx: AuditContext) {
  const usage = await getMockupUsage(actor, id);
  if (!usage.canDelete) return { ok: false as const, error: "in-use" as const, usage };
  await prisma.$transaction(async (tx) => {
    await tx.mockup.delete({ where: { id } });
    await writeAudit(tx, ctx, {
      action: "MOCKUP_DELETED",
      targetType: "mockup",
      targetId: String(id),
      after: { deleted: true },
    });
  });
  return { ok: true as const };
}
