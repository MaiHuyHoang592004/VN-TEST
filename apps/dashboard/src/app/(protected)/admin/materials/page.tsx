import { requirePermission } from "@/modules/core/guard";
import { listMaterials } from "@/modules/inventory/materials/queries";
import { MaterialsTable } from "@/components/pages/admin/materials/materials-table";

/**
 * Material master data: what an item IS, never how many exist.
 *
 * Counts are deliberately elsewhere (/inventory) — the only number here is
 * availability, and it is read-only. Splitting them keeps "rename a material"
 * out of the code path that moves goods.
 */
export default async function AdminMaterialsPage({
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

  // ACTIVE by default, as the legacy page did: a retired material is rarely
  // what someone came looking for, and the filter says so out loud.
  const status = (one("status") ?? "ACTIVE") as "ACTIVE";

  const { rows, total } = await listMaterials({
    search: one("q") || undefined,
    type: (one("type") as "RAW_MATERIAL") || undefined,
    status: status === ("ALL" as string) ? undefined : status,
    page: Number(one("page") ?? 1) || 1,
    pageSize: Number(one("size") ?? 25) || 25,
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <MaterialsTable total={total} rows={rows} />
    </main>
  );
}
