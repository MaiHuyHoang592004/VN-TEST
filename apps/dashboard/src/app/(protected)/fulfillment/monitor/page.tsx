import { listGroups } from "@/modules/fulfillment/stations/queries";
import { MonitorTable } from "@/components/pages/fulfillment/monitor-table";

/**
 * Every parcel in flight, one column each. READ ONLY — there is deliberately not
 * a single mutation on this page.
 *
 * That is the whole point of it: a supervisor watching the floor should be
 * able to look at anything without the risk of moving it, and a station is
 * where work gets done. Legacy's equivalent mixed the two and its status
 * dropdowns were the most common source of "who changed this?".
 *
 * A server component, so the first paint is real data rather than a spinner
 * over a fetch. "Load more" pages by GROUP through the cursor.
 */
export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const filter = raw === "ready" || raw === "all" ? raw : "open";

  const { groups, nextCursor } = await listGroups({ filter, limit: 50 });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <MonitorTable filter={filter} initialGroups={groups} initialCursor={nextCursor} />
    </main>
  );
}
