"use client";

import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTiles } from "@/components/pages/inventory/stat-tiles";
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
      <StatTiles
        tiles={[
          { label: t("home.customer.orders"), value: totalOrders },
          { label: t("home.customer.quantity"), value: totalQuantity },
          { label: t("home.customer.skus"), value: data.bySku.length },
          { label: t("home.customer.mockups"), value: data.byMockup.length },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {data.byStatus.map((s) => (
          <Badge key={s.status} product="secondary" className="gap-1.5">
            {t(`orders.statuses.${s.status}`)}
            <span className="tabular-nums">{s.orders}</span>
          </Badge>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankedList title={t("home.customer.bySku")} rows={data.bySku} />
        <RankedList title={t("home.customer.byMockup")} rows={data.byMockup} />
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          product="outline"
          nativeButton={false}
          render={<Link href="/fulfillment/monitor" />}
        >
          {t("home.customer.monitor")}
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
    <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("home.customer.nothing")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((column) => (
            <li key={column.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-mono text-xs">{column.label}</span>
                <span className="tabular-nums">
                  {column.quantity.toLocaleString()}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {column.orders} {t("home.customer.ordersWord")}
                  </span>
                </span>
              </div>
              {/* Relative to the top column, so the eye reads the ranking. */}
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${top ? (column.quantity / top) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
