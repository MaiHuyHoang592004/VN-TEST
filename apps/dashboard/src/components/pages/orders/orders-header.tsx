"use client";

import { useMemo } from "react";

import { FilterChip, PageHeader } from "@/components/ds";
import { useTableParams } from "@/components/global/data-table";
import { useTranslation } from "@/lib/i18n";

import { TAB_STATUSES } from "./order-filters";
import type { StatusSummaryRow } from "./status-summary";

/** The canned filters, in the order the design reads them. */
const TABS = ["all", "processing", "attention"] as const;

/**
 * The Orders hero.
 *
 * `tone="soft"` — pale sky, navy title — rather than the home page's saturated
 * cream-on-sky. Home is the app's brand moment and already spends that hero; a
 * list screen with a saturated one pushes the table below the fold.
 *
 * A client component because there is no server-side `t()` in this app: every
 * translated string comes from the `useTranslation` context, so a server page
 * cannot build its own title. The page stays a server component and renders
 * this.
 */
export function OrdersHeader({ summary }: { summary: StatusSummaryRow[] }) {
  const { t } = useTranslation();
  const params = useTableParams();
  const tab = params.get("tab") ?? "all";

  /**
   * Counts per chip, summed from the SAME rows the card strip below draws.
   * One server groupBy feeds both, so a chip and a card can never disagree —
   * and nothing here re-counts anything the browser happens to be holding,
   * which is the bug the summary query exists to prevent.
   *
   * What they count is the current WINDOW, not the whole table:
   * orderStatusSummary takes the list's site, date range and search but
   * deliberately no status, so "All" means "all in this window" and the chips
   * agree with the cards under every filter except the status ones — which is
   * correct, because those are what the chips themselves set.
   */
  const counts = useMemo(() => {
    const byStatus = new Map(summary.map((row) => [row.status, row.orders]));
    // TAB_STATUSES is the SAME map the page filters by and the select-all
    // action resolves — it used to be restated here, which is exactly how the
    // action came to have no tab at all. `undefined` is "no status filter",
    // so "All" sums every row rather than an enumerated set.
    const sum = (statuses: readonly string[] | undefined) =>
      statuses === undefined
        ? summary.reduce((total, row) => total + row.orders, 0)
        : statuses.reduce((total, status) => total + (byStatus.get(status) ?? 0), 0);
    return {
      all: sum(TAB_STATUSES.all),
      processing: sum(TAB_STATUSES.processing),
      attention: sum(TAB_STATUSES.attention),
    };
  }, [summary]);

  return (
    <PageHeader
      meta={t("nav.orders")}
      title={t("orders.title")}
      subtitle={t("orders.subtitle")}
      tone="soft"
    >
      {/* The chips sit INSIDE the hero, which is the slot PageHeader's
          `children` exists for and where the design draws them. They were
          below it, on the shell — a strip of filters floating between two
          surfaces rather than belonging to either.

          Chips, not tabs: they FILTER the same query rather than navigating,
          so they carry aria-pressed. `x === "all" ? "" : x` is the URL
          contract — "all" is the ABSENCE of the param, not a value.

          COUNTS, as the design draws them ("All 204 · Processing 46 · Needs
          attention 3"). They were left off with a note saying the only count
          query was gated on orders.status.update and a seller would never
          receive it, so numbers here would be invented. That gating is gone —
          the page's own comment records the reasoning: orderStatusSummary
          guards on the same three read grants as the list and applies
          orderScope(actor) to its groupBy, so a seller's counts are counts of
          the seller's own orders and nothing else. The strip is served to
          every reader now, and these chips are handed the same rows. */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <FilterChip
            key={x}
            label={t(`orders.tabs.${x}`)}
            count={counts[x]}
            active={tab === x}
            onClick={() => params.setFilter("tab", x === "all" ? "" : x)}
          />
        ))}
      </div>
    </PageHeader>
  );
}
