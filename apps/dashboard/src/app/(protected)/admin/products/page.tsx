import type { ProductStatus } from "@opcreative/db";

import { requirePermission } from "@/modules/core/guard";
import { listProducts } from "@/modules/catalog/products/queries";
import { ProductsTable } from "@/components/pages/admin/products/products-table";
import { AdminPageHeader } from "@/components/pages/admin/admin-header";
import { Page } from "@/components/ds";

/**
 * Reads the table's URL state and fetches exactly that page.
 *
 * Gated on products.MANAGE, not products.read. Every role can read the
 * catalogue — that is what /catalog is for — so leaning on the query's own
 * guard would have let any seller open the admin screen. Hiding the nav item
 * is not access control; this line is.
 *
 * Paginated on the server, unlike the warehouses screen: warehouses are tens of
 * rows and filter fine in the browser, while a catalogue is thousands.
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("products.manage");

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const { rows, total } = await listProducts({
    search: one("q") || undefined,
    status: (one("status") as ProductStatus) || undefined,
    page: Number(one("page") ?? 1) || 1,
    pageSize: Number(one("size") ?? 25) || 25,
  });

  return (
    <Page>
      <AdminPageHeader />
      <ProductsTable
        total={total}
        rows={rows.map((p) => ({
          id: p.id,
          name: p.name,
          key: p.key,
          thumbnail: p.thumbnail,
          status: p.status,
          skus: p._count.variants,
          updatedAt: p.updatedAt.toISOString(),
        }))}
      />
    </Page>
  );
}
