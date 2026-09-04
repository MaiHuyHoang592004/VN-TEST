"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MetricCard, StatusBadge, Surface } from "@/components/ds";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";

export type WarehouseHomeData = {
  bySku: { label: string; orders: number; quantity: number }[];
  byMockup: { label: string; orders: number; quantity: number }[];
  byStatus: { status: string; orders: number; quantity: number }[];
};

/**
 * What the floor is making, by SKU and by artwork.
 *
 * Legacy shipped these two as donut charts that never rendered — the widgets
 * read a context the page never supplied. These are plain ranked lists: no
 * chart dependency, and every number comes from a query that runs.
 */
export function WarehouseHome({ data }: { data: WarehouseHomeData }) {
  const { t } = useTranslation();
  const totalOrders = data.byStatus.reduce((sum, s) => sum + s.orders, 0);
  const totalQuantity = data.byStatus.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <>
      {/* Orders in the window is the floor's headline figure; the units behind
          it are work in flight. SKU and artwork counts are plain totals. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          tone="action"
          label={t("home.warehouse.orders")}
          value={totalOrders.toLocaleString()}
        />
        <MetricCard
          tone="progress"
          label={t("home.warehouse.quantity")}
          value={totalQuantity.toLocaleString()}
        />
        <MetricCard label={t("home.warehouse.skus")} value={data.bySku.length.toLocaleString()} />
        <MetricCard
          label={t("home.warehouse.mockups")}
          value={data.byMockup.length.toLocaleString()}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {data.byStatus.map((s) => (
          <StatusBadge key={s.status} status={s.status}>
            {t(`orders.statuses.${s.status}`)}
            <span className="tabular-nums">{s.orders}</span>
          </StatusBadge>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankedList title={t("home.warehouse.bySku")} rows={data.bySku} />
        <RankedList title={t("home.warehouse.byMockup")} rows={data.byMockup} />
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/fulfillment/monitor" />}
        >
          {t("home.warehouse.monitor")}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </>
  );
}

function RankedList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; orders: number; quantity: number }[];
}) {
  const { t } = useTranslation();
  const top = rows[0]?.quantity ?? 0;

  return (
    <Surface title={title}>
      {rows.length === 0 ? (
        <p className="text-(length:--fs-body-sm) text-(--text-muted)">
          {t("home.warehouse.nothing")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((column) => (
            <li key={column.label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-(length:--fs-body-sm)">
                <span className="truncate font-mono text-(length:--fs-meta) text-(--text-body)">
                  {column.label}
                </span>
                <span className="tabular-nums text-(--text-body)">
                  {column.quantity.toLocaleString()}
                  <span className="ml-2 text-(length:--fs-meta) text-(--text-muted)">
                    {column.orders} {t("home.warehouse.ordersWord")}
                  </span>
                </span>
              </div>
              {/* Relative to the top column, so the eye reads the ranking. */}
              <div className="h-1.5 overflow-hidden rounded-full bg-(--surface-inset)">
                <div
                  className="h-full rounded-full bg-(--action-500)"
                  style={{ width: `${top ? (column.quantity / top) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
