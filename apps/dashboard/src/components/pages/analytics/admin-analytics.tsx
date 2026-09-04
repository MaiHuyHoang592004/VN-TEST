"use client";

import { MetricCard, PageSection } from "@/components/ds";
import { money } from "@/lib/money";

import { RankedList } from "./ranked-list";
import { WarehouseAnalytics, type WarehouseAnalyticsData } from "./warehouse-analytics";
import { useTranslation } from "@/lib/i18n";

export type AdminAnalyticsData = {
  summary: {
    transactions: number;
    customers: number;
    orders: number;
    quantity: number;
    baseCost: string;
    topup: string;
  };
  rows: { id: string; name: string; orders: number; quantity: number }[];
};

/**
 * Everyone's numbers, from reports/adminReport, plus the production
 * breakdowns from reports/warehouseReport — an admin holds every permission,
 * so both queries are legitimately available and each answers a different
 * question: who is ordering, and what is being made.
 */
export function AdminAnalytics({
  data,
  floor,
}: {
  data: AdminAnalyticsData;
  floor: WarehouseAnalyticsData;
}) {
  const { t } = useTranslation();

  // adminReport returns every active seller ordered by email — presentation
  // order for a ranked list, nothing computed: the numbers are the query's.
  const topSellers = [...data.rows]
    .map((row) => ({ label: row.name, orders: row.orders, quantity: row.quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  return (
    <>
      <PageSection>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            tone="action"
            label={t("analytics.volume.orders")}
            value={data.summary.orders.toLocaleString()}
          />
          <MetricCard
            tone="progress"
            label={t("analytics.volume.units")}
            value={data.summary.quantity.toLocaleString()}
          />
          <MetricCard label={t("analytics.volume.spend")} value={money(data.summary.baseCost)} />
          <MetricCard
            label={t("analytics.volume.sellers")}
            value={data.summary.customers.toLocaleString()}
          />
        </div>
      </PageSection>

      <PageSection>
        <RankedList
          title={t("analytics.volume.sellers")}
          subtitle={t("analytics.topSku.subtitle")}
          rows={topSellers}
          empty={t("analytics.statusMix.empty")}
          mono={false}
        />
      </PageSection>

      <WarehouseAnalytics data={floor} />
    </>
  );
}
