"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n";
import { TIME_PERIODS, type TimePeriod } from "@/lib/time-period";

/**
 * Today / This week / This month / This year / All / custom — the legacy
 * segmented control, kept because it is the vocabulary the team already uses.
 *
 * It writes to the URL and lets the server re-render: the numbers are computed
 * where the data is, and a chosen window can be shared as a link.
 */
export function PeriodControl({ period }: { period: TimePeriod }) {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useTranslation();

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="border-border flex flex-wrap gap-1 rounded-md border p-1">
        {TIME_PERIODS.filter((p) => p !== "custom").map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period === p ? "secondary" : "ghost"}
            onClick={() => setParams({ period: p, from: "", to: "" })}
          >
            {t(`home.periods.${p}`)}
          </Button>
        ))}
      </div>

      {/* Native date inputs: the platform ships the picker, the keyboard
          support and the locale format. */}
      <Input
        type="date"
        aria-label={t("home.from")}
        className="w-36"
        value={params.get("from") ?? ""}
        onChange={(e) => setParams({ period: "custom", from: e.target.value })}
      />
      <Input
        type="date"
        aria-label={t("home.to")}
        className="w-36"
        value={params.get("to") ?? ""}
        onChange={(e) => setParams({ period: "custom", to: e.target.value })}
      />
    </div>
  );
}
