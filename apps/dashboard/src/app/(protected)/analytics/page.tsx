import { can, type SessionUser } from "@gwprint/auth";

import { Page } from "@/components/ds";
import { requireUser } from "@/modules/core/guard";
import {
  adminReport,
  sellerReport,
  warehouseReport,
} from "@/modules/platform/reports/queries";
import { resolvePeriod, type ResolvedPeriod } from "@/lib/time-period";

import { AdminAnalytics } from "@/components/pages/analytics/admin-analytics";
import { AnalyticsHeader } from "@/components/pages/analytics/analytics-header";
import { AnalyticsNoAccess } from "@/components/pages/analytics/no-access";
import { PendingPanels } from "@/components/pages/analytics/pending-panels";
import { SellerAnalytics } from "@/components/pages/analytics/seller-analytics";
import { WarehouseAnalytics } from "@/components/pages/analytics/warehouse-analytics";

/**
 * The deeper cut of the numbers the home dashboard opens with: the same
 * reports module, read over a chosen window, broken down by status, SKU,
 * artwork and seller.
 *
 * Switched by PERMISSION rather than role name, and in the same order as the
 * home dashboard — ADMIN holds every permission, so the widest grant is asked
 * about first. Each report guards itself again on the server; this branch only
 * decides which question to ask.
 *
 * NOTHING on this page is computed here. Every figure comes from a query in
 * modules/platform/reports, and the four measures that have no query yet are
 * rendered as empty frames by <PendingPanels> rather than estimated.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const range = resolvePeriod({ period: one("period"), from: one("from"), to: one("to") });

  const section = await roleSection(user.roles, range);

  return (
    <Page>
      <AnalyticsHeader period={range.period} />
      {section}
      <PendingPanels />
    </Page>
  );
}

/** The one branch on the page. Widest grant first, exactly as the home
 * dashboard orders it, because ADMIN holds every permission. */
async function roleSection(
  roles: SessionUser["roles"],
  range: ResolvedPeriod,
) {
  if (can(roles, "transactions.read.all")) {
    const [report, floor] = await Promise.all([adminReport(range), warehouseReport(range)]);
    return <AdminAnalytics data={report} floor={floor} />;
  }

  if (can(roles, "transactions.read.own")) {
    return <SellerAnalytics data={await sellerReport(range)} />;
  }

  if (can(roles, "orders.read.customer")) {
    return <WarehouseAnalytics data={await warehouseReport(range)} />;
  }

  return <AnalyticsNoAccess />;
}
