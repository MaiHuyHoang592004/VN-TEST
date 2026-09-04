"use client";

import { useState } from "react";

import { MetricCard, StatusBadge } from "@/components/ds";
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
import { money } from "@/lib/money";

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

/**
 * The seller's own ledger, on the shared data table — so it paginates instead
 * of rendering every transaction ever, which is what the hand-rolled version
 * did and what would have fallen over first in production.
 *
 * `summary` defaults to TRUE, which is /profile/billing exactly as it has
 * always been: balance tiles, the two request buttons and their dialogs, then
 * the table. The full-width /wallet route renders its balance in a sky hero and
 * its actions in the page toolbar, so it passes `summary={false}` and takes the
 * ledger alone. One component, two framings — not two copies of a ledger.
 */
export function BillingPanel({
  rows,
  total,
  balance,
  debt,
  refundable,
  summary = true,
}: {
  rows: TransactionRow[];
  total: number;
  balance: string;
  debt: string;
  /** Server-quoted: what each order is worth back, so the dialog cannot
   * promise a number the service would refuse. */
  refundable: RefundableOrder[];
  /** Render the balance card, the request buttons and their dialogs above the
   * table. Off for callers that already show the balance and own the actions. */
  summary?: boolean;
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
      // A transaction TYPE is not a status: explicit neutral, never toneFor().
      cell: (tx) => (
        <StatusBadge status={tx.type} tone="neutral" dot={false}>
          {tx.type.toLowerCase().replace("_", " ")}
        </StatusBadge>
      ),
    },
    {
      id: "amount",
      header: t("profile.billing.colAmount"),
      className: "text-right font-mono tracking-(--ls-mono) tabular-nums",
      cell: (tx) => {
        const n = Number(tx.amount);
        return (
          <span
            className={
              n < 0 ? "text-(--status-critical-fg)" : "text-(--status-success-fg)"
            }
          >
            {n >= 0 ? "+" : ""}
            {money(tx.amount)}
          </span>
        );
      },
    },
    {
      id: "balanceAfter",
      header: t("profile.billing.colBalanceAfter"),
      className: "text-right font-mono tracking-(--ls-mono) tabular-nums",
      hideOnMobile: true,
      cell: (tx) => (tx.balanceAfter ? money(tx.balanceAfter) : "—"),
    },
    {
      id: "status",
      header: t("profile.billing.colStatus"),
      hideOnMobile: true,
      // TransactionStatus IS in STATUS_TONES.
      cell: (tx) => <StatusBadge status={tx.status}>{tx.status.toLowerCase()}</StatusBadge>,
    },
    {
      id: "note",
      header: t("profile.billing.colNote"),
      hideOnMobile: true,
      cell: (tx) => (
        <span className="line-clamp-1 text-(--text-muted)">{tx.note ?? "—"}</span>
      ),
    },
  ];

  return (
    <SettingsStack>
      {summary && (
      <SettingsCard
        title={t("profile.billing.balance")}
        description={t("profile.billing.balanceHint")}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          {/* The wallet is the strictest surface in the app for DS rule 4, so
              the balance is a MetricCard in the display face and every figure
              beside it is mono. The strings are the server's, untouched — this
              component never does arithmetic on money. */}
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard
              tone="action"
              label={t("profile.billing.available")}
              value={money(balance)}
            />
            {Number(debt) > 0 && (
              <MetricCard
                tone="critical"
                label={t("profile.billing.owed")}
                value={money(debt)}
              />
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
      )}

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

      {summary && (
        <>
          <TopUpRequestDialog
            open={asking === "topup"}
            onOpenChange={(o) => !o && setAsking(null)}
          />
          <RefundRequestDialog
            orders={refundable}
            open={asking === "refund"}
            onOpenChange={(o) => !o && setAsking(null)}
          />
        </>
      )}
    </SettingsStack>
  );
}
