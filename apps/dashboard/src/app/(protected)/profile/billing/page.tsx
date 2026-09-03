import { requirePermission } from "@/modules/core/guard";
import {
  getMyProfile,
  getMyTransactions,
} from "@/modules/identity/profile/queries";
import { myRefundableOrders } from "@/modules/finance/requests/queries";
import { BillingPanel } from "@/components/pages/profile/transactions-table";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Guarded on the capability, not the role: a direct visit is turned away by
  // requirePermission, which is also what the tab is hidden by, so the two can
  // never disagree. (Hiding a tab is cosmetics; this is the security.)
  await requirePermission("transactions.read.own");
  const me = await getMyProfile();

  const sp = await searchParams;
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const [{ rows, total }, refundable] = await Promise.all([
    getMyTransactions({ page: Number(pageParam ?? 1) || 1 }),
    myRefundableOrders(),
  ]);

  return (
    <BillingPanel
      total={total}
      // Decimal → string: a float would lose cents crossing to the client.
      balance={me.balance.toString()}
      refundable={refundable}
      debt={me.debt.toString()}
      rows={rows.map((t) => ({
        id: t.id,
        publicId: t.publicId,
        amount: t.amount.toString(),
        type: t.type,
        status: t.status,
        paymentMethod: t.paymentMethod,
        note: t.note,
        balanceAfter: t.balanceAfter?.toString() ?? null,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
