"use client";

import { useTranslation } from "@/lib/i18n";
import type { TimePeriod } from "@/lib/time-period";

import { PeriodControl } from "./period-control";

/** Title, subtitle and the window every number below is measured in. */
export function HomeHeader({ period }: { period: string }) {
  const { t } = useTranslation();

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("home.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("home.subtitle")}</p>
      </div>
      <PeriodControl period={period as TimePeriod} />
    </div>
  );
}
