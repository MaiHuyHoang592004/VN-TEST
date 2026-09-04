import { requirePermission } from "@/modules/core/guard";
import { listVendors } from "@/modules/finance/vendors/queries";
import { VendorsTable } from "@/components/pages/admin/vendors/vendors-table";
import { AdminPageHeader } from "@/components/pages/admin/admin-header";
import { Page } from "@/components/ds";

/**
 * Supplier master data — who the company buys from.
 *
 * The model landed with doc 06's stock receipts because a shipment needs
 * someone to have sent it; this is the page that maintains it, and the same
 * rows feed the expenses form's vendor picker.
 */
export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("vendors.manage");

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const { rows, total, tiles } = await listVendors({
    search: one("q") || undefined,
    status: (one("status") as "ACTIVE") || undefined,
    page: Number(one("page") ?? 1) || 1,
    pageSize: Number(one("size") ?? 25) || 25,
  });

  return (
    <Page>
      <AdminPageHeader />
      <VendorsTable
        total={total}
        tiles={tiles}
        rows={rows.map((v) => ({
          ...v,
          updatedAt: v.updatedAt.toISOString(),
        }))}
      />
    </Page>
  );
}
