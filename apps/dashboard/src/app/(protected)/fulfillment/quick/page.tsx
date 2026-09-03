import { requirePermission } from "@/modules/core/guard";
import { QuickScan } from "@/components/pages/fulfillment/quick-scan";

/**
 * Quick scan — one status, applied to whole parcels as fast as they can be
 * waved at a gun.
 *
 * Separate from the station on purpose: this is the sorting bench, not the
 * packing bench. Nobody here is filling counters or taking photos, they are
 * moving a pile of parcels into one state, and a screen that also offered fill
 * controls would be slower for both jobs.
 */
export default async function QuickScanPage() {
  await requirePermission("orders.status.update");
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <QuickScan />
    </main>
  );
}
