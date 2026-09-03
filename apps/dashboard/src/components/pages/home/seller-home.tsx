"use client";

import { LifeBuoy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTiles } from "@/components/pages/inventory/stat-tiles";
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
      <StatTiles
        tiles={[
          {
            label: t("home.seller.balance"),
            value: Number(data.balance),
            display: money(data.balance),
          },
          {
            label: t("home.seller.debt"),
            value: Number(data.debt),
            display: money(data.debt),
            tone: "danger",
          },
          { label: t("home.seller.orders"), value: data.orders },
          { label: t("home.seller.quantity"), value: data.quantity },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("home.seller.statuses")}</h2>
            <span className="text-muted-foreground text-xs">
              {data.statusTotal.toLocaleString()} {t("home.seller.ordersWord")}
            </span>
          </div>

          {data.statuses.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("home.seller.noOrders")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.statuses.map((s) => {
                const share = data.statusTotal ? (s.count / data.statusTotal) * 100 : 0;
                return (
                  <li key={s.status} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Badge product="secondary">{t(`orders.statuses.${s.status}`)}</Badge>
                      <span className="tabular-nums">
                        {s.count.toLocaleString()}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {share.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    {/* A bar, not a chart library: one div and a width. */}
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("home.seller.recent")}</h2>
            <Link href="/profile/billing" className="text-xs underline-offset-2 hover:underline">
              {t("home.seller.allTransactions")}
            </Link>
          </div>

          {data.recent.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("home.seller.noTransactions")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {data.recent.map((tx) => {
                const negative = tx.amount.startsWith("-");
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{t(`finance.types.${tx.type}`)}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(tx.createdAt).toLocaleDateString()} ·{" "}
                        {t(`finance.statuses.${tx.status}`)}
                      </p>
                    </div>
                    <span
                      className={`font-mono tabular-nums ${
                        negative ? "text-destructive" : "text-vercel-green"
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
        </section>
      </div>

      {data.openTickets > 0 && (
        <div className="border-border bg-card mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm">
            <LifeBuoy className="text-muted-foreground size-4" />
            {t("home.seller.openTickets").replace("{count}", String(data.openTickets))}
          </div>
          {/* A link that looks like a button: Base UI needs to be told it is not a
              native <button>, or it strips the semantics (CLAUDE.md). */}
          <Button
            product="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/tickets" />}
          >
            {t("home.seller.viewTickets")}
          </Button>
        </div>
      )}
    </>
  );
}
