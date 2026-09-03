import { requirePermission } from "@/modules/core/guard";
import { listTransactions } from "@/modules/finance/transactions/queries";
import { TransactionsTable } from "@/components/pages/admin/transactions/transactions-table";

/**
 * The admin view of the ledger.
 *
 * Gated on transactions.read.ALL, not the .own the query asks for: the query is
 * shared with a seller's own /profile/billing, so leaning on its guard would
 * let any seller open the admin screen — the same trap /admin/products fell
 * into. The scope still narrows the rows; this decides who sees the page.
 */
export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("transactions.read.all");

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const { rows, total } = await listTransactions({
    search: one("q") || undefined,
    type: (one("type") as "TOPUP") || undefined,
    status: (one("status") as "PENDING") || undefined,
    page: Number(one("page") ?? 1) || 1,
    pageSize: Number(one("size") ?? 25) || 25,
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <TransactionsTable
        total={total}
        rows={rows.map((r) => ({
          id: r.id,
          publicId: r.publicId,
          // Money as strings — Decimal doesn't cross the boundary.
          amount: r.amount.toFixed(2),
          type: r.type,
          status: r.status,
          note: r.note,
          description: r.description,
          evidence: attachmentsOf(r.evidence),
          orderIds: orderIdsOf(r.metadata),
          balanceBefore: r.balanceBefore?.toFixed(2) ?? null,
          balanceAfter: r.balanceAfter?.toFixed(2) ?? null,
          createdAt: r.createdAt.toISOString(),
          userName: r.user.name ?? r.user.email,
          userEmail: r.user.email,
        }))}
      />
    </main>
  );
}

/** Json is `unknown` to Prisma, so it becomes a type HERE rather than as a
 * cast scattered through the table. */
function attachmentsOf(value: unknown): { url: string; originalFilename: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is { url: string; originalFilename?: string } =>
      Boolean(f && typeof f === "object" && "url" in f),
    )
    .map((f) => ({ url: f.url, originalFilename: f.originalFilename ?? "" }));
}

function orderIdsOf(value: unknown): number[] {
  const ids = (value as { orderIds?: unknown } | null)?.orderIds;
  return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === "number") : [];
}
