"use client";

import { LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MetricCard, StatusBadge, Surface } from "@/components/ds";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";

export type SellerHomeData = {
  balance: string;
  debt: string;
  orders: number;
  quantity: number;
  baseCost: string;
  statuses: { status: string; count: number }[];
  statusTotal: number;
  openTickets: number;
  recent: {
    id: number;
    publicId: string;
    type: string;
    status: string;
    amount: string;
    createdAt: string;
  }[];
};

const money = (v: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v));

/** The seller's own dashboard: money at the top, where their orders are
 * underneath, and the two things that need an answer from them (debt, open
 * tickets) called out rather than buried. */
export function SellerHome({ data }: { data: SellerHomeData }) {
  const { t } = useTranslation();

  return (
    <>
      {/* Tones follow the metric's MEANING, not variety: the balance is this
          screen's headline figure, debt is the one number that needs an answer,
          and a count of orders is a plain total. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          tone="action"
          label={t("home.seller.balance")}
          value={money(data.balance)}
        />
        <MetricCard
          tone={Number(data.debt) > 0 ? "critical" : "neutral"}
          label={t("home.seller.debt")}
          value={money(data.debt)}
        />
        <MetricCard label={t("home.seller.orders")} value={data.orders.toLocaleString()} />
        <MetricCard label={t("home.seller.quantity")} value={data.quantity.toLocaleString()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface
          title={t("home.seller.statuses")}
          action={
            <span className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
              {data.statusTotal.toLocaleString()} {t("home.seller.ordersWord")}
            </span>
          }
        >
          {data.statuses.length === 0 ? (
            <p className="text-(length:--fs-body-sm) text-(--text-muted)">
              {t("home.seller.noOrders")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.statuses.map((s) => {
                const share = data.statusTotal ? (s.count / data.statusTotal) * 100 : 0;
                return (
                  <li key={s.status} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-(length:--fs-body-sm)">
                      {/* The colour comes from the raw status; the label stays
                          the caller's translated string. */}
                      <StatusBadge status={s.status}>
                        {t(`orders.statuses.${s.status}`)}
                      </StatusBadge>
                      <span className="tabular-nums text-(--text-body)">
                        {s.count.toLocaleString()}
                        <span className="ml-2 text-(length:--fs-meta) text-(--text-muted)">
                          {share.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    {/* A bar, not a chart library: one div and a width. */}
                    <div className="h-1.5 overflow-hidden rounded-full bg-(--surface-inset)">
                      <div
                        className="h-full rounded-full bg-(--action-500)"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>

        <Surface
          title={t("home.seller.recent")}
          action={
            <Button variant="link" size="sm" nativeButton={false} render={<Link href="/profile/billing" />}>
              {t("home.seller.allTransactions")}
            </Button>
          }
        >
          {data.recent.length === 0 ? (
            <p className="text-(length:--fs-body-sm) text-(--text-muted)">
              {t("home.seller.noTransactions")}
            </p>
          ) : (
            <ul className="divide-y divide-(--border-hairline)">
              {data.recent.map((tx) => {
                const negative = tx.amount.startsWith("-");
                return (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-3 py-2 text-(length:--fs-body-sm)"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-(--text-body)">{t(`finance.types.${tx.type}`)}</p>
                      <p className="text-(length:--fs-meta) text-(--text-muted)">
                        {new Date(tx.createdAt).toLocaleDateString()} ·{" "}
                        {t(`finance.statuses.${tx.status}`)}
                      </p>
                    </div>
                    <span
                      className={`font-mono tabular-nums ${
                        negative ? "text-(--status-critical-fg)" : "text-(--status-success-fg)"
                      }`}
                    >
                      {negative ? "" : "+"}
                      {money(tx.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      </div>

      {data.openTickets > 0 && (
        <Surface className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-(length:--fs-body-sm) text-(--text-body)">
            <LifeBuoy className="size-4 stroke-(--text-label)" />
            {t("home.seller.openTickets").replace("{count}", String(data.openTickets))}
          </div>
          {/* A link that looks like a button: Base UI needs to be told it is not a
              native <button>, or it strips the semantics (CLAUDE.md). */}
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/tickets" />}
          >
            {t("home.seller.viewTickets")}
          </Button>
        </Surface>
      )}
    </>
  );
}
