import { notFound } from "next/navigation";

import { requireAnyPermission } from "@/modules/core/guard";
import { getTicketDetail } from "@/modules/support/tickets/queries";
import { TicketError } from "@/modules/support/index";
import { TicketThread } from "@/components/pages/support/ticket-thread";

/**
 * One ticket, as a conversation.
 *
 * A ticket the visitor may not see is a 404, not a 403: telling a seller "that
 * exists but is not yours" already leaks that it exists. The scope in the query
 * does the deciding; this page only translates its refusal.
 */
export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAnyPermission("tickets.read.own", "tickets.read.all");
  const { id } = await params;

  const ticket = await getTicketDetail(Number(id)).catch((e) => {
    if (e instanceof TicketError) notFound();
    throw e;
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 lg:px-20">
      <TicketThread
        ticket={{
          id: ticket.id,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          reason: ticket.reason,
          createdAt: ticket.createdAt.toISOString(),
          attachments: attachmentsOf(ticket.attachments),
          author: {
            id: ticket.author.id,
            name: ticket.author.name ?? ticket.author.email ?? "—",
          },
          order: ticket.order
            ? { id: ticket.order.id, label: ticket.order.externalId ?? `#${ticket.order.id}` }
            : null,
          replies: ticket.replies.map((r) => ({
            id: r.id,
            content: r.content,
            createdAt: r.createdAt.toISOString(),
            attachments: attachmentsOf(r.attachments),
            author: { id: r.author.id, name: r.author.name ?? r.author.email ?? "—" },
          })),
        }}
      />
    </main>
  );
}

/** The evidence-Json row, narrowed to what the thread renders. Json is
 * `unknown` to Prisma, so this is where it becomes a type instead of a cast
 * scattered through the component. */
function attachmentsOf(value: unknown): { url: string; originalFilename: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is { url: string; originalFilename?: string } =>
      Boolean(f && typeof f === "object" && "url" in f),
    )
    .map((f) => ({ url: f.url, originalFilename: f.originalFilename ?? "" }));
}
