"use client";

import { MetricCard, PageSection } from "@/components/ds";
import { money } from "@/lib/money";

import { StatusMix } from "./status-mix";
import { useTranslation } from "@/lib/i18n";

export type SellerAnalyticsData = {
  orders: number;
  quantity: number;
  baseCost: string;
  statuses: { status: string; count: number }[];
  statusTotal: number;
};

/**
 * The seller's own numbers, from reports/sellerReport — SELF ONLY, by the
 * query's own design.
 *
 * There is deliberately no SKU or artwork breakdown here: those come from
 * warehouseReport, which a seller has no permission to call, and inventing a
 * seller-scoped version of it is a query, not a page.
 */
export function SellerAnalytics({ data }: { data: SellerAnalyticsData }) {
  const { t } = useTranslation();

  return (
    <>
      <PageSection>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard
            tone="action"
            label={t("analytics.volume.orders")}
            value={data.orders.toLocaleString()}
          />
          <MetricCard
            tone="progress"
            label={t("analytics.volume.units")}
            value={data.quantity.toLocaleString()}
          />
          <MetricCard label={t("analytics.volume.spend")} value={money(data.baseCost)} />
        </div>
      </PageSection>

      <PageSection>
        <StatusMix rows={data.statuses} total={data.statusTotal} />
      </PageSection>
    </>
  );
}
