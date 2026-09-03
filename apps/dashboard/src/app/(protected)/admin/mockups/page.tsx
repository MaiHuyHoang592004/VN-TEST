import { listMockups } from "@/modules/catalog/mockups/queries";
import { MockupsTable } from "@/components/pages/admin/mockups/mockups-table";

/**
 * No extra requirePermission here, unlike /admin/products: listMockups already
 * guards on mockups.MANAGE, which IS this screen's permission. Warehouse admins
 * and support hold it so they can fix a bad mockup without gaining the variant
 * catalogue or its prices.
 */
export default async function AdminMockupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const { rows, total } = await listMockups({
    search: one("q") || undefined,
    status: (one("status") as "active" | "inactive") || undefined,
    page: Number(one("page") ?? 1) || 1,
    pageSize: Number(one("size") ?? 25) || 25,
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <MockupsTable
        total={total}
        rows={rows.map((m) => ({
          id: m.id,
          name: m.name,
          url: m.url,
          thumbnail: m.thumbnail,
          folderId: m.folderId,
          status: m.status,
          orders: m._count.orders,
          updatedAt: m.updatedAt.toISOString(),
        }))}
      />
    </main>
  );
}
