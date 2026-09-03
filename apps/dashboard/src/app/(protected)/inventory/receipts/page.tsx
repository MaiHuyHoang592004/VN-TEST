import { requirePermission } from "@/modules/core/guard";
import { listReceipts, shipmentsReport } from "@/modules/inventory/receipts/queries";
import { listMySitesAction } from "@/modules/inventory/stock/actions";
import { listMaterialOptions } from "@/modules/inventory/suppliers/queries";
import { ReceiptsTable } from "@/components/pages/inventory/receipts-table";

/**
 * Goods arriving. An admin raises a receipt (one customer, one or more
 * shipments, each with lines); the customer receives per shipment, possibly
 * across several days, entering what turned up and what was damaged.
 *
 * The one rule the screen has to respect: receiving is delta-based, so the
 * inputs are prefilled with the CURRENT totals rather than blanks. Typing the
 * new total is the interaction; the service works out the difference.
 */
export default async function ReceiptsPage({
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

  const warehouseId = Number(one("customer")) || undefined;

  const [{ rows, total }, report, sites, suppliers] = await Promise.all([
    listReceipts({
      search: one("q") || undefined,
      status: (one("status") as "PENDING") || undefined,
      warehouseId,
      page: Number(one("page") ?? 1) || 1,
      pageSize: Number(one("size") ?? 25) || 25,
    }),
    shipmentsReport({ warehouseId }),
    listMySitesAction(),
    listMaterialOptions(),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <ReceiptsTable
        total={total}
        sites={sites}
        suppliers={suppliers}
        tiles={{
          upcoming: report.upcomingEta,
          overdue: report.overdueEta,
          partial: report.partialReceipts,
          variance: report.quantityVariances.length,
        }}
        rows={rows.map((r) => ({
          id: r.id,
          code: r.code,
          itemType: r.itemType,
          status: r.status,
          supplier: r.supplier,
          customer: r.customer.name,
          shipmentCount: r.shipmentCount,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
