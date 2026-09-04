import { can, type SessionUser } from "@gwprint/auth";

import { Page } from "@/components/ds";

import { adminReport, sellerReport, warehouseReport } from "@/modules/platform/reports/queries";
import { resolvePeriod } from "@/lib/time-period";

import { AdminHome } from "./admin-home";
import { HomeHeader } from "./home-header";
import { SellerHome } from "./seller-home";
import { WarehouseHome } from "./warehouse-home";

/**
 * The signed-in home, switched by PERMISSION rather than role name — the rule
 * the rest of the app follows, and the reason a new role that can read all
 * transactions gets the admin view without this file changing.
 *
 * Order matters: ADMIN holds every permission, so the widest grant is asked
 * about first. Anyone holding none of the three (a designer) still gets the
 * header and the nav, rather than a blank screen.
 */
export async function Home({
  user,
  searchParams,
}: {
  user: SessionUser;
  searchParams: { period?: string; from?: string; to?: string };
}) {
  const range = resolvePeriod(searchParams);

  if (can(user.roles, "transactions.read.all")) {
    const report = await adminReport(range);
    return (
      <Shell period={range.period} name={user.name}>
        <AdminHome summary={report.summary} rows={report.rows} />
      </Shell>
    );
  }

  if (can(user.roles, "transactions.read.own")) {
    const report = await sellerReport(range);
    return (
      <Shell period={range.period} name={user.name}>
        <SellerHome data={report} />
      </Shell>
    );
  }

  if (can(user.roles, "orders.read.customer")) {
    const report = await warehouseReport(range);
    return (
      <Shell period={range.period} name={user.name}>
        <WarehouseHome data={report} />
      </Shell>
    );
  }

  return <Shell period={range.period} name={user.name} />;
}

function Shell({
  period,
  name,
  children,
}: {
  period: string;
  name?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <Page>
      <HomeHeader period={period} name={name} />
      {children}
    </Page>
  );
}
