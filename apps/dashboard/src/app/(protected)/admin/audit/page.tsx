import type { AuditAction } from "@gwprint/db";

import { listAuditLog } from "@/modules/platform/audit/queries";
import { AuditTable } from "@/components/pages/admin/audit/audit-table";
import { AdminPageHeader } from "@/components/pages/admin/admin-header";
import { Page } from "@/components/ds";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const { rows, total } = await listAuditLog({
    action: (one("action") as AuditAction) || undefined,
    targetType: one("targetType") || undefined,
    page: Number(one("page") ?? 1) || 1,
    pageSize: Number(one("size") ?? 50) || 50,
  });

  return (
    <Page>
      <AdminPageHeader />
      <AuditTable
        total={total}
        rows={rows.map((r) => ({
          // BigInt isn't JSON-serialisable across the server→client boundary.
          id: String(r.id),
          action: r.action,
          actor: r.actor ? { name: r.actor.name, email: null } : null,
          targetType: r.targetType,
          targetId: r.targetId,
          before: r.before,
          after: r.after,
          reason: r.reason,
          ip: r.ip,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </Page>
  );
}
