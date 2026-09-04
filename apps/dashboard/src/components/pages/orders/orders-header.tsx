"use client";

import { FilterChip, PageHeader } from "@/components/ds";
import { useTableParams } from "@/components/global/data-table";
import { useTranslation } from "@/lib/i18n";

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
export function OrdersHeader() {
  const { t } = useTranslation();
  const params = useTableParams();
  const tab = params.get("tab") ?? "all";

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

          No counts, deliberately. The design shows "All 204 · Processing 46 ·
          Needs attention 3", but the only count query is orderStatusSummary,
          which is gated on orders.status.update — a seller never receives it,
          and this is the seller's screen. Numbers here would be invented. */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <FilterChip
            key={x}
            label={t(`orders.tabs.${x}`)}
            active={tab === x}
            onClick={() => params.setFilter("tab", x === "all" ? "" : x)}
          />
        ))}
      </div>
    </PageHeader>
  );
}
