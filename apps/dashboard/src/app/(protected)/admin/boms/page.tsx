import { requirePermission } from "@/modules/core/guard";
import { bomCoverage, listBoms } from "@/modules/inventory/boms/queries";
import { listMaterialOptions } from "@/modules/inventory/suppliers/queries";
import { listMySitesAction } from "@/modules/inventory/stock/actions";
import { listSkuOptions } from "@/modules/catalog/variant-variants/queries";
import { BomsTable } from "@/components/pages/admin/boms/boms-table";
import { CoverageTable } from "@/components/pages/admin/boms/coverage-table";

/**
 * Bills of suppliers: what each SKU is made of, and whether the components are
 * on the shelf.
 *
 * Two views on one route rather than two routes, because Coverage is a lens on
 * the same data rather than a separate area — and the Administration tab column
 * has no room to explain that "BOMs" and "Coverage" belong together. `?tab=`
 * keeps both deep-linkable, and each branch fetches only what it renders.
 */
export default async function AdminBomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("inventory.read");

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const tab = one("tab") === "coverage" ? "coverage" : "configs";
  const warehouseId = Number(one("customer")) || undefined;

  if (tab === "coverage") {
    const [coverage, sites] = await Promise.all([
      bomCoverage({ search: one("q") || undefined, warehouseId }),
      listMySitesAction(),
    ]);
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
        <CoverageTable rows={coverage.rows} tiles={coverage.tiles} sites={sites} />
      </main>
    );
  }

  const [{ rows, total, tiles }, suppliers, skus, sites] = await Promise.all([
    listBoms({
      search: one("q") || undefined,
      status: (one("status") as "ACTIVE") || undefined,
      page: Number(one("page") ?? 1) || 1,
      pageSize: Number(one("size") ?? 25) || 25,
    }),
    listMaterialOptions(),
    listSkuOptions(),
    listMySitesAction(),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <BomsTable
        total={total}
        tiles={tiles}
        suppliers={suppliers}
        skus={skus}
        sites={sites}
        rows={rows.map((b) => ({
          id: b.id,
          name: b.name,
          version: b.version,
          status: b.status,
          variantId: b.productVariant.id,
          variantSku: b.productVariant.sku,
          variantName: `${b.productVariant.variant.name} · ${b.productVariant.product.name}`,
          summary: b.summary,
        }))}
      />
    </main>
  );
}
