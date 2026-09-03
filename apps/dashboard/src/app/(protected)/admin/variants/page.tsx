import type { ProductStatus } from "@opcreative/db";

import { requirePermission } from "@/modules/core/guard";
import { listVariants } from "@/modules/catalog/variants/queries";
import { VariantsTable } from "@/components/pages/admin/variants/variants-table";

/**
 * Gated on products.MANAGE, not the products.read that listVariants asks for:
 * every role may read the catalogue, so the query's own guard would let any
 * seller open the admin screen (the same trap /admin/products fell into).
 */
export default async function AdminVariantsPage({
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

  const { rows, total } = await listVariants({
    search: one("q") || undefined,
    status: (one("status") as ProductStatus) || undefined,
    page: Number(one("page") ?? 1) || 1,
    pageSize: Number(one("size") ?? 25) || 25,
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <VariantsTable
        total={total}
        rows={rows.map((v) => ({
          id: v.id,
          name: v.name,
          key: v.key,
          status: v.status,
          skus: v._count.productVariants,
          updatedAt: v.updatedAt.toISOString(),
        }))}
      />
    </main>
  );
}
