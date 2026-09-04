"use client";

import { MetricCard, PageSection } from "@/components/ds";

import { RankedList } from "./ranked-list";
import { StatusMix } from "./status-mix";
import { useTranslation } from "@/lib/i18n";

export type WarehouseAnalyticsData = {
  bySku: { label: string; orders: number; quantity: number }[];
  byMockup: { label: string; orders: number; quantity: number }[];
  byStatus: { status: string; orders: number; quantity: number }[];
};

/**
 * What the floor actually made, from reports/warehouseReport. The scope is
 * applied inside the query, so a warehouse user sees their sites and nobody
 * else's.
 */
export function WarehouseAnalytics({ data }: { data: WarehouseAnalyticsData }) {
  const { t } = useTranslation();

  const orders = data.byStatus.reduce((sum, s) => sum + s.orders, 0);
  const units = data.byStatus.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <>
      <PageSection>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            tone="action"
            label={t("analytics.volume.orders")}
            value={orders.toLocaleString()}
          />
          <MetricCard
            tone="progress"
            label={t("analytics.volume.units")}
            value={units.toLocaleString()}
          />
          <MetricCard
            label={t("analytics.volume.skus")}
            value={data.bySku.length.toLocaleString()}
          />
          <MetricCard
            label={t("analytics.volume.artwork")}
            value={data.byMockup.length.toLocaleString()}
          />
        </div>
      </PageSection>

      <PageSection>
        <div className="grid gap-4 lg:grid-cols-2">
          <RankedList
            title={t("analytics.topSku.title")}
            subtitle={t("analytics.topSku.subtitle")}
            rows={data.bySku}
            empty={t("analytics.topSku.empty")}
          />
          <RankedList
            title={t("analytics.topArtwork.title")}
            subtitle={t("analytics.topArtwork.subtitle")}
            rows={data.byMockup}
            empty={t("analytics.topArtwork.empty")}
          />
        </div>
        <StatusMix
          rows={data.byStatus.map((s) => ({ status: s.status, count: s.orders }))}
          total={orders}
        />
      </PageSection>
    </>
  );
}
