import { requirePermission } from "@/modules/core/guard";
import { listMovements } from "@/modules/inventory/stock/queries";
import { listMySitesAction } from "@/modules/inventory/stock/actions";
import { MovementsTable } from "@/components/pages/inventory/movements-table";

/**
 * The ledger: every change to every count, in the order it happened.
 *
 * Paged by CURSOR, not offset — this table only ever grows, and OFFSET 40000
 * re-scans every earlier column to answer one page. It is also why there is no
 * separate import-history screen: that is this page with a type filter.
 */
export default async function MovementsPage({
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

  const [{ rows, nextCursor }, sites] = await Promise.all([
    listMovements({
      itemType: (one("itemType") as "MATERIAL") || undefined,
      search: one("q") || undefined,
      type: (one("type") as "RECEIPT") || undefined,
      warehouseId: Number(one("customer")) || undefined,
      cursor: one("cursor") || undefined,
    }),
    listMySitesAction(),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <MovementsTable
        sites={sites}
        nextCursor={nextCursor}
        rows={rows.map((m) => ({
          id: m.id,
          type: m.type,
          quantity: m.quantity,
          note: m.note,
          reference:
            m.referenceType && m.referenceId
              ? `${m.referenceType} ${m.referenceId}`
              : (m.referenceType ?? (m.orderId ? `order ${m.orderId}` : null)),
          createdAt: m.createdAt.toISOString(),
          warehouse: m.warehouse.name,
          user: m.user,
          sku: m.sku,
          name: m.name,
        }))}
      />
    </main>
  );
}
