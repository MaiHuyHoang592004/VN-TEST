import "server-only";

import { prisma, AUDIT_SELECT, type AuditAction, type Prisma } from "@opcreative/db";

import { requirePermission } from "../../core/guard.ts";

export type AuditQuery = {
  actorId?: string;
  action?: AuditAction;
  targetType?: string;
  targetId?: string;
  page?: number;
  pageSize?: number;
};

export async function listAuditLog(query: AuditQuery = {}) {
  await requirePermission("audit.read");
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
  const where: Prisma.AuditLogWhereInput = {
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: AUDIT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}
