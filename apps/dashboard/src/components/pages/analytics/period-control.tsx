"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TIME_PERIODS, type TimePeriod } from "@/lib/time-period";
import { useTranslation } from "@/lib/i18n";


/**
 * The window every number on this page is measured in.
 *
 * The home dashboard has the same control, but it pushes to "/" — this one has
 * to push to "/analytics", and that route is the only difference. Rather than
 * widen the home component (a shared file this change may not touch), the
 * strip is repeated here; the window itself is still resolved once, on the
 * server, by lib/time-period.
 *
 * It writes to the URL and lets the server re-render, so a chosen window can be
 * shared as a link and the numbers are computed where the data is.
 */
export function AnalyticsPeriodControl({ period }: { period: TimePeriod }) {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useTranslation();

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/analytics?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-(--radius-control) border border-(--border-soft) p-1">
        {TIME_PERIODS.filter((p) => p !== "custom").map((p) => (
          <Button
            key={p}
            size="sm"
            // Selected is a FILL, never an underline — and a fill is colour,
            // so the state is spoken too. These are filters, not links, which
            // is why it is aria-pressed and not aria-current.
            variant={period === p ? "secondary" : "ghost"}
            aria-pressed={period === p}
            onClick={() => setParams({ period: p, from: "", to: "" })}
          >
            {t(`analytics.periods.${p}`)}
          </Button>
        ))}
      </div>

      {/* Native date inputs: the platform ships the picker, the keyboard
          support and the locale format. */}
      <Input
        type="date"
        aria-label={t("analytics.from")}
        className="w-36"
        value={params.get("from") ?? ""}
        onChange={(e) => setParams({ period: "custom", from: e.target.value })}
      />
      <Input
        type="date"
        aria-label={t("analytics.to")}
        className="w-36"
        value={params.get("to") ?? ""}
        onChange={(e) => setParams({ period: "custom", to: e.target.value })}
      />
    </div>
  );
}
