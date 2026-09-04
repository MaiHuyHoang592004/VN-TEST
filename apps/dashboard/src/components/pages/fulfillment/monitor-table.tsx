"use client";

import { useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, Surface } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { listGroupsAction } from "@/modules/fulfillment/stations/actions";
import type { TrackingGroupSummary } from "@/modules/fulfillment/stations/service/monitor";

type Filter = "open" | "ready" | "all";
const FILTERS: Filter[] = ["open", "ready", "all"];

/**
 * The floor at a glance. Rows are PARCELS, and so is the pagination — legacy
 * grouped in app code while counting orders, so "1-25 of 812" sat above a
 * table of nine parcels and the next page skipped some entirely.
 *
 * The filter is a real route (a link, not client state) so a supervisor can
 * bookmark "what is still open" and the back button behaves.
 */
export function MonitorTable({
  filter,
  initialGroups,
  initialCursor,
}: {
  filter: Filter;
  initialGroups: TrackingGroupSummary[];
  initialCursor: number | null;
}) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState(initialGroups);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    const next = await listGroupsAction({ filter, cursor, limit: 50 });
    setLoading(false);
    setGroups((prev) => [...prev, ...next.groups]);
    setCursor(next.nextCursor);
  };

  return (
    <div className="space-y-6">
      {/* These are LINKS, not chips. Each filter is a real route so a
          supervisor can bookmark "what is still open" and the back button
          behaves — so they carry aria-current and take the DS's NAVIGATION
          treatment (the pale sky pill NavTabs uses), not FilterChip, whose
          aria-pressed and Action Blue fill belong to a filter that does not
          navigate. */}
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/fulfillment/monitor?filter=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={`inline-flex shrink-0 items-center rounded-(--radius-pill) px-3 py-1.5 font-sans text-(length:--fs-body-sm) font-semibold transition-colors duration-(--dur-fast) ease-(--ease-out) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none ${
              filter === f
                ? "bg-sky-200 text-navy-700"
                : "text-navy-500 hover:bg-sky-100 hover:text-navy-700"
            }`}
          >
            {t(`fulfillment.monitor.tabs.${f}`)}
          </Link>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-(--radius-card) bg-(--surface-shell) px-6 py-12 text-center text-(length:--fs-body-sm) text-(--text-muted)">
          {t("fulfillment.monitor.empty")}
        </p>
      ) : (
        <Surface pad={false} radius="card" shadow="xs" className="overflow-x-auto">
          {/* The board is read from across the room: the type stays at the size
              it already was rather than shrinking to the DS's body default. */}
          <table className="w-full text-sm">
            <thead className="text-(length:--fs-meta) text-(--text-label)">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("fulfillment.monitor.colTracking")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("fulfillment.monitor.colCustomer")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("fulfillment.monitor.colOrders")}</th>
                <th className="w-40 px-3 py-2 text-left font-medium">{t("fulfillment.monitor.colProgress")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("fulfillment.monitor.colStatus")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("fulfillment.monitor.colBasket")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("fulfillment.monitor.colLabel")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("fulfillment.monitor.colOldest")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-hairline)">
              {groups.map((g) => (
                <tr key={g.key} className="hover:bg-sky-50">
                  <td className="px-3 py-2 font-mono text-xs tracking-(--ls-mono) text-(--text-body)">
                    {g.trackingNumber ?? g.key}
                  </td>
                  <td className="px-3 py-2">{g.customer ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tracking-(--ls-mono) tabular-nums">
                    {g.orderCount}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--surface-inset)">
                        <div
                          className={`h-full rounded-full ${
                            g.totalFilled >= g.totalQuantity
                              ? "bg-(--status-success-dot)"
                              : "bg-action-500"
                          }`}
                          style={{
                            width: `${Math.min(100, (g.totalFilled / Math.max(1, g.totalQuantity)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs tracking-(--ls-mono) tabular-nums text-(--text-muted)">
                        {g.totalFilled}/{g.totalQuantity}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {/* The file Task 20 flagged: the hand-picked ON_HOLD
                          ternary goes, and the colour comes from STATUS_TONES
                          like the Orders table's badge for the same status. */}
                      {g.statuses.map((s) => (
                        <StatusBadge key={s} status={s} size="sm">
                          {t(`orders.statuses.${s}`)}
                        </StatusBadge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {g.basket ? (
                      <span className="inline-flex items-center gap-1 text-xs text-(--text-muted)">
                        <MapPin className="stroke-action-500 size-3.5" />
                        {g.basket}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {g.labelUrl ? (
                      <a
                        href={g.labelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-action-500 inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        <ExternalLink className="size-3.5" />
                        {t("fulfillment.monitor.label")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-(--text-muted)">
                    {new Date(g.oldestPlacedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {t("fulfillment.monitor.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
