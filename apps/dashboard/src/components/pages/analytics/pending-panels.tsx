"use client";

import { CalendarRange, Clock, LineChart, Store } from "lucide-react";

import { ChartFrame, PageSection, SectionHeading } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";


/**
 * The four figures this page would show if the query existed.
 *
 * They are rendered as EMPTY frames on purpose. There is no time-bucketed
 * order aggregate, no marketplace grouping and no status-transition report in
 * modules/platform/reports, so there is no honest series to draw — and a
 * plausible-looking line drawn from nothing is worse than a blank frame,
 * because someone will make a decision from it.
 *
 * Each body says exactly which query is missing, so the next person to open
 * this file knows what to build rather than what to delete.
 *
 * ChartFrame's `ask` is filled — the question each panel would answer is real
 * and is the reason the panel is worth building. `fields` is deliberately
 * LEFT UNSET on all four: ChartFrame.d.ts is DOMAIN-BOUND ("never list a field
 * to make a chart look better-grounded than it is") and none of these panels
 * consumes a backend field yet, because none of them has a query. Listing the
 * fields the aggregate WOULD read would be the exact dishonesty the prop
 * exists to prevent.
 */
export function PendingPanels() {
  const { t } = useTranslation();

  const panels = [
    { key: "trend", icon: <LineChart /> },
    { key: "revenue", icon: <CalendarRange /> },
    { key: "marketplace", icon: <Store /> },
    { key: "leadTime", icon: <Clock /> },
  ];

  return (
    <PageSection>
      <SectionHeading
        title={t("analytics.pending.heading")}
        subtitle={t("analytics.pending.subheading")}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {panels.map((panel) => (
          <ChartFrame
            key={panel.key}
            title={t(`analytics.pending.${panel.key}.title`)}
            ask={t(`analytics.pending.${panel.key}.ask`)}
            height={160}
          >
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span aria-hidden="true" className="[&_svg]:size-6 [&_svg]:stroke-(--text-label)">
                {panel.icon}
              </span>
              <p className="max-w-xs font-sans text-(length:--fs-body-sm) text-(--text-muted)">
                {t(`analytics.pending.${panel.key}.body`)}
              </p>
            </div>
          </ChartFrame>
        ))}
      </div>
    </PageSection>
  );
}
