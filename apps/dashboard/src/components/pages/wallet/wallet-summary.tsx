"use client";

import { useTranslation } from "@/lib/i18n";

import { MetricCard } from "@/components/ds";
import { money } from "@/lib/money";


/**
 * The tile column beside the balance.
 *
 * Every figure here is a value the page already loaded: the debt on the
 * profile, the count of orders the refund service says are refundable, and the
 * transaction total the ledger paginates over.
 *
 * DELIBERATELY MISSING, and not faked: the design's "Spent this month" tile and
 * the balance sparkline. Neither has a query behind it — `BillingPanel` and this
 * page receive `balance`, `debt`, `refundable`, `rows` and `total` and nothing
 * else — and a KPI a reader cannot trust is worse than a KPI that is absent.
 * Add the queries first; the tiles are two lines each after that.
 */
export function WalletSummary({
  debt,
  refundableCount,
  transactionCount,
}: {
  debt: string;
  refundableCount: number;
  transactionCount: number;
}) {
  const { t } = useTranslation();
  const owed = Number(debt);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Owed only appears when there IS one — a permanent "0 ₫ owed" tile
          trains the eye to ignore the one place debt would ever show up. */}
      {Number.isFinite(owed) && owed > 0 && (
        <MetricCard
          tone="critical"
          label={t("wallet.owed")}
          value={money(debt)}
          deltaNote={t("wallet.owedNote")}
        />
      )}
      <MetricCard
        tone="info"
        label={t("wallet.refundable")}
        value={refundableCount.toLocaleString()}
        deltaNote={t("wallet.refundableNote")}
      />
      <MetricCard
        tone="neutral"
        label={t("wallet.movements")}
        value={transactionCount.toLocaleString()}
        deltaNote={t("wallet.movementsNote")}
      />
    </div>
  );
}
