"use client";

import { useState } from "react";

import {
  DataTable,
  type Column,
} from "@/components/global/data-table";
import { MetricCard, SearchField } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

export type SellerRow = {
  id: string;
  name: string;
  email: string;
  orders: number;
  quantity: number;
  baseCost: string;
  topup: string;
  balance: string;
  debt: string;
};

const money = (v: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v));

/**
 * What the whole business did in the window, then every seller inside it.
 *
 * The six tiles are the legacy report's headline numbers, computed server-side
 * over the range — not summed from the rows below, which are already the full
 * seller list but would stop being so the moment this table paginates.
 */
export function AdminHome({
  summary,
  rows,
}: {
  summary: {
    transactions: number;
    customers: number;
    orders: number;
    quantity: number;
    baseCost: string;
    topup: string;
  };
  rows: SellerRow[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  // Client-side: the column set is every active seller, already in memory, and
  // filtering it is not a database question.
  const filtered = query.trim()
    ? rows.filter((r) =>
        `${r.name} ${r.email}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : rows;

  const columns: Column<SellerRow>[] = [
    {
      id: "name",
      header: t("home.admin.colSeller"),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <p className="truncate text-xs text-(--text-muted)">{r.email}</p>
        </div>
      ),
    },
    {
      id: "orders",
      header: t("home.admin.colOrders"),
      className: "text-right tabular-nums",
      cell: (r) => r.orders.toLocaleString(),
    },
    {
      id: "quantity",
      header: t("home.admin.colQuantity"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (r) => r.quantity.toLocaleString(),
    },
    {
      id: "baseCost",
      header: t("home.admin.colBaseCost"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (r) => <span className="font-mono text-sm">{money(r.baseCost)}</span>,
    },
    {
      id: "topup",
      header: t("home.admin.colTopups"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (r) => <span className="font-mono text-sm">{money(r.topup)}</span>,
    },
    {
      id: "balance",
      header: t("home.admin.colBalance"),
      className: "text-right tabular-nums",
      cell: (r) => <span className="font-mono text-sm">{money(r.balance)}</span>,
    },
    {
      id: "debt",
      header: t("home.admin.colDebt"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (r) =>
        Number(r.debt) > 0 ? (
          <span className="font-mono text-sm text-(--status-critical-fg)">{money(r.debt)}</span>
        ) : (
          <span className="text-(--text-muted)">—</span>
        ),
    },
  ];

  return (
    <>
      {/* Money in is the headline figure and takes the one Action tone on this
          screen; the other five are plain totals, which the DS renders neutral
          rather than colouring for variety. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label={t("home.admin.transactions")}
          value={summary.transactions.toLocaleString()}
        />
        <MetricCard
          label={t("home.admin.customers")}
          value={summary.customers.toLocaleString()}
        />
        <MetricCard label={t("home.admin.orders")} value={summary.orders.toLocaleString()} />
        <MetricCard label={t("home.admin.quantity")} value={summary.quantity.toLocaleString()} />
        <MetricCard label={t("home.admin.baseCost")} value={money(summary.baseCost)} />
        <MetricCard tone="action" label={t("home.admin.topups")} value={money(summary.topup)} />
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        rowId={(r) => r.id}
        empty={t("home.admin.empty")}
        toolbar={
          <div className="p-3">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={t("home.admin.search")}
              className="max-w-xs"
            />
          </div>
        }
      />
    </>
  );
}
