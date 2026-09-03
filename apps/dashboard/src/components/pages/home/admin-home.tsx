"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
  DataTable,
  type Column,
} from "@/components/global/data-table";
import { StatTiles } from "@/components/pages/inventory/stat-tiles";
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
          <p className="text-muted-foreground truncate text-xs">{r.email}</p>
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
          <span className="text-red-600 font-mono text-sm">{money(r.debt)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <StatTiles
        tiles={[
          { label: t("home.admin.transactions"), value: summary.transactions },
          { label: t("home.admin.customers"), value: summary.customers },
          { label: t("home.admin.orders"), value: summary.orders },
          { label: t("home.admin.quantity"), value: summary.quantity },
          {
            label: t("home.admin.baseCost"),
            value: Number(summary.baseCost),
            display: money(summary.baseCost),
          },
          {
            label: t("home.admin.topups"),
            value: Number(summary.topup),
            display: money(summary.topup),
          },
        ]}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowId={(r) => r.id}
        empty={t("home.admin.empty")}
        toolbar={
          <div className="p-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("home.admin.search")}
              className="max-w-xs"
            />
          </div>
        }
      />
    </>
  );
}
