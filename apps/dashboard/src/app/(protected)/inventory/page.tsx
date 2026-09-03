import { requirePermission } from "@/modules/core/guard";
import { listStock } from "@/modules/inventory/stock/queries";
import { listMySitesAction } from "@/modules/inventory/stock/actions";
import { StockTable } from "@/components/pages/inventory/stock-table";

/**
 * What is on the shelves — suppliers and finished goods on ONE page.
 *
 * Legacy had two parallel screens for this, /material-inventory and
 * /physical-inventory, with their own services and their own bugs. Here the
 * item type is a filter: the query, the tiles and the adjust dialog are the
 * same code whichever way the toggle is set.
 */
export default async function InventoryPage({
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

  const itemType = one("itemType") === "PRODUCT" ? "PRODUCT" : "MATERIAL";
  const warehouseId = Number(one("customer")) || undefined;

  const [{ rows, total, totals }, sites] = await Promise.all([
    listStock({
      itemType,
      search: one("q") || undefined,
      warehouseId,
      page: Number(one("page") ?? 1) || 1,
      pageSize: Number(one("size") ?? 25) || 25,
    }),
    listMySitesAction(),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <StockTable
        itemType={itemType}
        rows={rows}
        total={total}
        totals={totals}
        sites={sites}
      />
    </main>
  );
}
