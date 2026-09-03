import { requirePermission } from "@/modules/core/guard";
import { listCategories, listEntries } from "@/modules/finance/expenses/queries";
import { listVendorOptions } from "@/modules/finance/vendors/queries";
import { ExpensesPanel } from "@/components/pages/admin/expenses/expenses-panel";

/**
 * The company's own books — rent, ink, salaries, scrap sales.
 *
 * Not the seller ledger, and deliberately a different page from
 * /admin/transactions: nothing here moves a balance, and putting the two on one
 * screen is how a bookkeeping entry eventually gets typed into someone's wallet.
 *
 * Entries and Categories are ONE route with a `tab` param rather than two nav
 * tabs: categories are a dependent list nobody navigates to on purpose, and the
 * param still gives deep links and a working back button — which is the reason
 * config/nav-tabs.ts insists tabs be routes in the first place.
 */
export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("expenses.manage");

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const [entries, categories, vendors] = await Promise.all([
    listEntries({
      search: one("q") || undefined,
      type: (one("type") as "EXPENSE") || undefined,
      categoryId: Number(one("category")) || undefined,
      vendorId: Number(one("vendor")) || undefined,
      from: one("from") || undefined,
      to: one("to") || undefined,
      page: Number(one("page") ?? 1) || 1,
      pageSize: Number(one("size") ?? 25) || 25,
    }),
    listCategories(),
    listVendorOptions(),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <ExpensesPanel
        tab={one("tab") === "categories" ? "categories" : "entries"}
        total={entries.total}
        summary={entries.summary}
        vendors={vendors}
        categories={categories.map((c) => ({
          ...c,
          updatedAt: c.updatedAt.toISOString(),
        }))}
        rows={entries.rows.map((e) => ({
          id: e.id,
          type: e.type,
          // Money as strings — Decimal doesn't cross the boundary.
          amount: e.amount.toFixed(2),
          occurredAt: e.occurredAt.toISOString(),
          paymentMethod: e.paymentMethod,
          description: e.description,
          category: e.category,
          vendor: e.vendor,
        }))}
      />
    </main>
  );
}
