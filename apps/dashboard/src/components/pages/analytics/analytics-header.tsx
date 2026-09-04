"use client";

import { PageHeader } from "@/components/ds";
import type { TimePeriod } from "@/lib/time-period";

import { AnalyticsPeriodControl } from "./period-control";
import { useTranslation } from "@/lib/i18n";

/**
 * The operational hero. `tone="soft"` like every other operational screen —
 * the one saturated-sky brand moment in the app belongs to the home dashboard,
 * and a second one would spend the rhythm the DS rations.
 *
 * It carries NO action: PageHeader has no `action` prop by design. The window
 * control is secondary content INSIDE the hero, which is what `children` is
 * for.
 */
export function AnalyticsHeader({ period }: { period: TimePeriod }) {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("analytics.meta")}
      title={t("analytics.title")}
      subtitle={t("analytics.subtitle")}
      tone="soft"
    >
      <AnalyticsPeriodControl period={period} />
    </PageHeader>
  );
}
