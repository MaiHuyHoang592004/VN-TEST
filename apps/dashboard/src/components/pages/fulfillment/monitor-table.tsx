"use client";

import { useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("fulfillment.monitor.title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("fulfillment.monitor.subtitle")}</p>
      </header>

      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/fulfillment/monitor?filter=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              filter === f
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`fulfillment.monitor.tabs.${f}`)}
          </Link>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed px-6 py-12 text-center text-sm">
          {t("fulfillment.monitor.empty")}
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
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
            <tbody className="divide-border divide-y">
              {groups.map((g) => (
                <tr key={g.key} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{g.trackingNumber ?? g.key}</td>
                  <td className="px-3 py-2">{g.customer ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.orderCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full ${
                            g.totalFilled >= g.totalQuantity ? "bg-vercel-green" : "bg-vercel-blue"
                          }`}
                          style={{
                            width: `${Math.min(100, (g.totalFilled / Math.max(1, g.totalQuantity)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {g.totalFilled}/{g.totalQuantity}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {g.statuses.map((s) => (
                        <Badge key={s} product={s === "ON_HOLD" ? "destructive" : "secondary"}>
                          {t(`orders.statuses.${s}`)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {g.basket ? (
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        <MapPin className="stroke-vercel-blue size-3.5" />
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
                        className="text-vercel-blue inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        <ExternalLink className="size-3.5" />
                        {t("fulfillment.monitor.label")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">
                    {new Date(g.oldestPlacedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button product="outline" onClick={loadMore} disabled={loading}>
            {t("fulfillment.monitor.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
