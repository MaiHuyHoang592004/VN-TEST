import { Page, PageSection } from "@/components/ds";
import { requirePermission } from "@/modules/core/guard";
import {
  getMyProfile,
  getMyTransactions,
} from "@/modules/identity/profile/queries";
import { myRefundableOrders } from "@/modules/finance/requests/queries";
import { BillingPanel } from "@/components/pages/profile/transactions-table";
import { WalletActions } from "@/components/pages/wallet/wallet-actions";
import { WalletHeader } from "@/components/pages/wallet/wallet-header";
import { WalletSummary } from "@/components/pages/wallet/wallet-summary";

/**
 * The wallet, full width.
 *
 * The same wallet lives at /profile/billing, inside a max-w-3xl settings
 * column — which is right for a settings tab and wrong for the screen the
 * sidebar and the navbar's Tools menu both point at. This route is the
 * operational one: the DS page container at its full max-w-7xl, the balance in
 * a sky hero, and the SAME `BillingPanel` ledger underneath (with its own
 * balance card off, since the hero already carries it). /profile/billing is
 * untouched.
 *
 * Guarded on the capability, not the role — the same permission the billing tab
 * is hidden by, so the two can never disagree.
 */
export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("transactions.read.own");
  const me = await getMyProfile();

  const sp = await searchParams;
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const [{ rows, total }, refundable] = await Promise.all([
    getMyTransactions({ page: Number(pageParam ?? 1) || 1 }),
    myRefundableOrders(),
  ]);

  // Decimal → string: a float would lose the value crossing to the client.
  const balance = me.balance.toString();
  const debt = me.debt.toString();

  return (
    <Page>
      <WalletHeader balance={balance} />
      <WalletActions refundable={refundable} />

      <PageSection>
        <WalletSummary
          debt={debt}
          refundableCount={refundable.length}
          transactionCount={total}
        />
        <BillingPanel
          summary={false}
          total={total}
          balance={balance}
          refundable={refundable}
          debt={debt}
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
      </PageSection>
    </Page>
  );
}
