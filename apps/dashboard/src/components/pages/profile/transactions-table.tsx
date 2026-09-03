"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsStack } from "./settings-card";
import {
  DataTable,
  DataTablePagination,
  useTableParams,
  type Column,
} from "@/components/global/data-table";
import { useTranslation } from "@/lib/i18n";
import {
  RefundRequestDialog,
  TopUpRequestDialog,
  type RefundableOrder,
} from "./money-request-dialogs";

export type TransactionRow = {
  id: number;
  publicId: string;
  amount: string;
  type: string;
  status: string;
  paymentMethod: string | null;
  note: string | null;
  balanceAfter: string | null;
  createdAt: string;
};

const money = (v: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v));

/**
 * The seller's own ledger, on the shared data table — so it paginates instead
 * of rendering every transaction ever, which is what the hand-rolled version
 * did and what would have fallen over first in production.
 */
export function BillingPanel({
  rows,
  total,
  balance,
  debt,
  refundable,
}: {
  rows: TransactionRow[];
  total: number;
  balance: string;
  debt: string;
  /** Server-quoted: what each order is worth back, so the dialog cannot
   * promise a number the service would refuse. */
  refundable: RefundableOrder[];
}) {
  const params = useTableParams({ pageSize: 20 });
  const { t } = useTranslation();
  const [asking, setAsking] = useState<"topup" | "refund" | null>(null);

  const columns: Column<TransactionRow>[] = [
    {
      id: "createdAt",
      header: t("profile.billing.colDate"),
      cell: (tx) => (
        <span className="whitespace-nowrap">
          {new Date(tx.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "type",
      header: t("profile.billing.colType"),
      cell: (tx) => <Badge variant="secondary">{tx.type.toLowerCase().replace("_", " ")}</Badge>,
    },
    {
      id: "amount",
      header: t("profile.billing.colAmount"),
      className: "text-right tabular-nums",
      cell: (tx) => {
        const n = Number(tx.amount);
        return (
          <span className={n < 0 ? "text-vercel-red" : "text-vercel-green"}>
            {n >= 0 ? "+" : ""}
            {money(tx.amount)}
          </span>
        );
      },
    },
    {
      id: "balanceAfter",
      header: t("profile.billing.colBalanceAfter"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (tx) => (tx.balanceAfter ? money(tx.balanceAfter) : "—"),
    },
    {
      id: "status",
      header: t("profile.billing.colStatus"),
      hideOnMobile: true,
      cell: (tx) => (
        <Badge variant={tx.status === "COMPLETED" ? "default" : "secondary"}>
          {tx.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      id: "note",
      header: t("profile.billing.colNote"),
      hideOnMobile: true,
      cell: (tx) => (
        <span className="text-muted-foreground line-clamp-1">{tx.note ?? "—"}</span>
      ),
    },
  ];

  return (
    <SettingsStack>
      <SettingsCard
        title={t("profile.billing.balance")}
        description={t("profile.billing.balanceHint")}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-wrap items-baseline gap-6">
          <div>
            <p className="text-muted-foreground text-xs uppercase">
              {t("profile.billing.available")}
            </p>
            <p className="mt-1 text-3xl font-medium tabular-nums">{money(balance)}</p>
          </div>
          {Number(debt) > 0 && (
            <div>
              <p className="text-muted-foreground text-xs uppercase">
                {t("profile.billing.owed")}
              </p>
              <p className="text-vercel-red mt-1 text-3xl font-medium tabular-nums">
                {money(debt)}
              </p>
            </div>
          )}
        </div>

          {/* The two things a seller can DO about the number they are reading. */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAsking("topup")}>
              {t("profile.billing.requestTopUp")}
            </Button>
            <Button variant="outline" onClick={() => setAsking("refund")}>
              {t("profile.billing.requestRefund")}
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("profile.billing.transactions")}
        description={t("profile.billing.transactionsHint")}
      >
        <DataTable
      rows={rows}
      columns={columns}
      rowId={(tx) => String(tx.id)}
      loading={params.pending}
      empty={t("profile.billing.empty")}
      footer={
        total > params.pageSize ? (
          <DataTablePagination
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            onPageChange={params.setPage}
          />
        ) : undefined
          }
        />
      </SettingsCard>

      <TopUpRequestDialog
        open={asking === "topup"}
        onOpenChange={(o) => !o && setAsking(null)}
      />
      <RefundRequestDialog
        orders={refundable}
        open={asking === "refund"}
        onOpenChange={(o) => !o && setAsking(null)}
      />
    </SettingsStack>
  );
}
