import type { UserRole, UserStatus } from "@opcreative/db";

import { listUsers } from "@/modules/identity/users/queries";
import { UsersTable } from "@/components/pages/admin/users/users-table";
import { AdminPageHeader } from "@/components/pages/admin/admin-header";
import { Page } from "@/components/ds";

/**
 * Reads the table's URL state and fetches exactly that page of rows. The query
 * is permission-guarded server-side — hiding the nav item is not access
 * control, so a direct visit is turned away here too.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const { rows, total } = await listUsers({
    search: one("q") || undefined,
    role: (one("role") as UserRole) || undefined,
    status: (one("status") as UserStatus) || undefined,
    page: Number(one("page") ?? 1) || 1,
    pageSize: Number(one("size") ?? 25) || 25,
  });

  return (
    <Page>
      <AdminPageHeader />
      <UsersTable
        total={total}
        rows={rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          image: u.image,
          avatarUrl: u.avatarUrl,
          roles: u.roles,
          status: u.status,
          tier: u.tier,
          // Decimal isn't serialisable across the server→client boundary, and
          // a float would lose cents. String all the way to the formatter.
          balance: u.balance.toString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </Page>
  );
}
