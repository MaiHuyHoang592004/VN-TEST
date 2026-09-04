import { requireAnyPermission } from "@/modules/core/guard";
import { listTickets } from "@/modules/support/tickets/queries";
import { listOrders } from "@/modules/fulfillment/orders/queries";
import { TicketsTable } from "@/components/pages/support/tickets-table";
import { TicketsHeader } from "@/components/pages/support/tickets-header";
import { Page } from "@/components/ds";
import type { TicketReason } from "@/modules/support/tickets/schema";

/**
 * Support tickets — one page for both sides of the conversation.
 *
 * The SCOPE decides what a visitor sees (a seller their own, support all), so
 * there is no seller page and staff page to drift apart. The New-ticket dialog
 * offers the actor's own recent orders, which is the same scope again.
 */
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAnyPermission("tickets.read.own", "tickets.read.all");

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const [{ rows, total }, orders] = await Promise.all([
    listTickets({
      search: one("q") || undefined,
      status: (one("status") as "OPEN") || undefined,
      priority: (one("priority") as "LOW") || undefined,
      reason: (one("reason") as TicketReason) || undefined,
      page: Number(one("page") ?? 1) || 1,
      pageSize: Number(one("size") ?? 25) || 25,
    }),
    // The picker, not a list: recent orders inside the actor's own scope.
    listOrders({ pageSize: 50 }),
  ]);

  return (
    <Page>
      <TicketsHeader />
      <TicketsTable
        total={total}
        orders={orders.rows.map((o) => ({
          id: o.id,
          label: o.externalId ?? `#${o.id}`,
        }))}
        rows={rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          status: r.status,
          priority: r.priority,
          reason: r.reason,
          replyCount: r.replyCount,
          createdAt: r.createdAt.toISOString(),
          author: r.author.name ?? r.author.email ?? "—",
          order: r.order ? { id: r.order.id, label: r.order.externalId ?? `#${r.order.id}` } : null,
        }))}
      />
    </Page>
  );
}
