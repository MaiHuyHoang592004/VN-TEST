"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";
import type { TimePeriod } from "@/lib/time-period";

import { PeriodControl } from "./period-control";

/**
 * The app's one brand moment: a cream display title on saturated sky, the wood
 * rings behind it, and the window every number below is measured in.
 *
 * The Craft Cut is PageHeader's own; the rings are the second mark. That is the
 * design system's per-screen maximum, so nothing below this header may add a
 * third.
 *
 * `t()` here takes a key and nothing else — interpolation is `.replace()`, the
 * same shape `home.seller.openTickets` already uses.
 */
export function HomeHeader({ period, name }: { period: string; name?: string | null }) {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("nav.home")}
      title={name ? t("home.greeting").replace("{name}", name) : t("home.title")}
      subtitle={t("home.subtitle")}
      tone="sky"
      rings
    >
      <PeriodControl period={period as TimePeriod} />
    </PageHeader>
  );
}
