import { requirePermission } from "@/modules/core/guard";
import { Station } from "@/components/pages/fulfillment/station";

/**
 * The scan station — where a parcel is found, made, photographed and handed
 * over. One screen, because on the floor it is one bench.
 *
 * Legacy had five: two were iterations of the same station, one was dead, and
 * the differences between the surviving three were accidents rather than
 * decisions. Merging them means a worker learns one screen and every rule
 * behaves the same way whichever barcode they scanned.
 *
 * A thin server shell on purpose: the guard runs here (rendering a station to
 * someone who cannot move an order would be a menu of failures), and
 * everything else is client state driven by one scan.
 */
export default async function FulfillmentPage() {
  await requirePermission("orders.status.update");
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <Station />
    </main>
  );
}
