/**
 * Support tickets: the thread, its attachments, and who is allowed to say what.
 *
 * Three rules legacy got wrong and this file exists to keep:
 *
 *  1. A CLOSED ticket refuses replies ON THE SERVER. Legacy hid the reply box
 *     client-side, which stops nobody who can send a request.
 *  2. An out-of-scope orderId is DROPPED AND REPORTED. Legacy dropped it
 *     silently, so a seller filed "about order 1234" and support saw a ticket
 *     attached to nothing.
 *  3. Both parties get told. Legacy sent no notification on any ticket event
 *     (NotificationService was never imported in its ticket module) — sellers
 *     refreshed the page to find out whether anyone had answered.
 */
import {
  prisma,
  writeAudit,
  orderScope,
  ticketScope,
  can,
  Prisma,
  type AuditContext,
  type TicketPriority,
  type TicketStatus,
} from "@gwprint/db";

import { assertImageBatch, storeImages } from "../../core/storage.ts";
import { notify, usersWithPermission } from "../../platform/index.ts";
import {
  createTicketSchema,
  replyTicketSchema,
  setStatusSchema,
  ticketListSchema,
  updateTicketSchema,
  type TicketListQuery,
} from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;

export type TicketErrorCode =
  /** No ticket with that id inside the actor's scope. */
  | "not-found"
  /** Replying to, or editing, a ticket that has been closed. */
  | "ticket-closed"
  /** The actor may read the ticket but not perform this act on it. */
  | "not-yours";

/** Same discipline as InventoryError/StorageError: the UI localises off `code`,
 * nobody parses English to decide what happened. */
export class TicketError extends Error {
  readonly code: TicketErrorCode;
  // Fields assigned explicitly, not via parameter properties: node --test
  // strips types rather than compiling them (modules/README.md).
  constructor(code: TicketErrorCode, message: string) {
    super(message);
    this.name = "TicketError";
    this.code = code;
  }
}

const isStaff = (actor: Actor) => can(actor.roles, "tickets.manage");

/** The ticket, re-read through the scope — an id from a client proves nothing. */
async function readTicket(actor: Actor, id: number) {
  const ticket = await prisma.ticket.findFirst({
    where: { ...(await ticketScope(actor)), id },
    select: { id: true, authorId: true, status: true, title: true },
  });
  if (!ticket) throw new TicketError("not-found", "That ticket no longer exists.");
  return ticket;
}

/** Attachments land under the ticket they belong to, so a bucket listing reads
 * like the app does. */
const attachmentPrefix = (ticketId: number) => `tickets/${ticketId}/`;

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listTickets(actor: Actor, raw: TicketListQuery = {}) {
  const query = ticketListSchema.parse(raw);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const like = query.search
    ? { contains: query.search, mode: "insensitive" as const }
    : undefined;

  const where: Prisma.TicketWhereInput = {
    // Scope FIRST, always: a seller sees their own, support sees all.
    ...(await ticketScope(actor)),
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.reason ? { reason: query.reason } : {}),
    ...(query.authorId ? { authorId: query.authorId } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(like
      ? {
          OR: [
            { title: like },
            { description: like },
            { order: { externalId: like } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      select: {
        id: true,
        title: true,
        // The list feeds the column's edit dialog, so it carries the editable
        // fields rather than making the dialog fetch the ticket again.
        description: true,
        status: true,
        priority: true,
        reason: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, externalId: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows: rows.map(({ _count, ...t }) => ({ ...t, replyCount: _count.replies })),
  };
}

/** The chat page's one query: the ticket plus its thread. */
export async function getTicketDetail(actor: Actor, id: number) {
  const ticket = await prisma.ticket.findFirst({
    where: { ...(await ticketScope(actor)), id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      reason: true,
      attachments: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true, email: true } },
      order: { select: { id: true, externalId: true } },
      replies: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          content: true,
          attachments: true,
          createdAt: true,
          author: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!ticket) throw new TicketError("not-found", "That ticket no longer exists.");
  return ticket;
}

/** The chip on the seller's dashboard (doc 07 D1) and the ticket page badge. */
export async function countOpenTickets(actor: Actor) {
  return prisma.ticket.count({
    where: { ...(await ticketScope(actor)), status: { in: ["OPEN", "IN_PROGRESS"] } },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Open a ticket. Returns the id plus, when it happened, the fact that the
 * order reference was dropped — see rule 2 at the top of this file.
 */
export async function createTicket(actor: Actor, raw: unknown, files: File[] = []) {
  const input = createTicketSchema.parse(raw);
  // Before the column: a rejected photo must not leave an empty ticket behind.
  assertImageBatch(files);

  let orderId: number | null = null;
  let droppedOrder = false;
  if (input.orderId) {
    const order = await prisma.order.findFirst({
      where: { ...(await orderScope(actor)), id: input.orderId, deletedAt: null },
      select: { id: true },
    });
    if (order) orderId = order.id;
    else droppedOrder = true;
  }

  const ticket = await prisma.ticket.create({
    data: {
      title: input.title,
      description: input.description || null,
      reason: input.reason,
      priority: input.priority,
      authorId: actor.id,
      orderId,
    },
    select: { id: true },
  });

  // Uploaded AFTER the column exists so the key can name the ticket. A failed
  // upload leaves a ticket with no photo, which is recoverable; a photo with
  // no ticket is an orphan in the bucket.
  if (files.length) {
    const stored = await storeImages(files, {
      prefix: attachmentPrefix(ticket.id),
      uploadedById: actor.id,
    });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { attachments: stored as never },
    });
  }

  // ponytail: no notification on CREATE — support works from the ticket list,
  // which sorts by last activity. Add a TICKET_OPENED type if the queue ever
  // gets missed; replies and status flips are the events people wait on.
  return { ok: true as const, id: ticket.id, droppedOrder };
}

/**
 * Add a message to the thread.
 *
 * The other party is notified: the author hears from staff, staff hear from the
 * author. "The other party" is computed from who is replying rather than from a
 * stored assignee, because tickets have no assignee and a supporter who picks
 * one up mid-thread would otherwise never be told about the answer.
 */
export async function replyTicket(actor: Actor, ticketId: number, raw: unknown, files: File[] = []) {
  const input = replyTicketSchema.parse(raw);
  const ticket = await readTicket(actor, ticketId);
  if (ticket.status === "CLOSED") {
    throw new TicketError("ticket-closed", "Reopen the ticket to reply to it.");
  }

  const attachments = files.length
    ? await storeImages(files, { prefix: attachmentPrefix(ticketId), uploadedById: actor.id })
    : [];

  const reply = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketReply.create({
      data: {
        ticketId,
        authorId: actor.id,
        content: input.content,
        attachments: attachments.length ? (attachments as never) : undefined,
      },
      select: { id: true },
    });
    // Touch the parent so the list sorts by "last activity" — the order support
    // actually works in.
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        updatedAt: new Date(),
        // A staff answer moves an untouched ticket into progress. Nobody has to
        // remember to flip a select, and the seller can see it was picked up.
        ...(isStaff(actor) && ticket.status === "OPEN"
          ? { status: "IN_PROGRESS" as TicketStatus }
          : {}),
      },
    });

    for (const userId of await counterparties(tx, ticket, actor)) {
      await notify(tx, {
        userId,
        type: "TICKET_REPLIED",
        data: { title: ticket.title, from: actor.name ?? actor.email ?? "Support" },
        href: `/tickets/${ticketId}`,
      });
    }
    return created;
  });

  return { ok: true as const, id: reply.id };
}

/**
 * Who should hear about this message.
 *
 * Staff replied → the ticket's author. The author replied → everyone who has
 * already answered in the thread, falling back to every ticket manager when
 * nobody has yet. That fallback is what stops a seller's follow-up on an
 * unanswered ticket from going nowhere.
 */
async function counterparties(
  tx: Prisma.TransactionClient,
  ticket: { id: number; authorId: string },
  actor: Actor,
): Promise<string[]> {
  if (actor.id !== ticket.authorId) return [ticket.authorId];

  const responders = await tx.ticketReply.findMany({
    where: { ticketId: ticket.id, NOT: { authorId: ticket.authorId } },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  if (responders.length) return responders.map((r) => r.authorId);

  // The audience comes from the SAME ROLE_PERMISSIONS table the guards read, so
  // "who may work tickets" and "who hears about them" can never disagree.
  return (await usersWithPermission("tickets.manage")).filter((id) => id !== actor.id);
}

/**
 * Move a ticket's status. The author may close and reopen their own; staff may
 * set anything. Audited — a status flip is what a support dispute hinges on.
 */
export async function setTicketStatus(
  actor: Actor,
  ticketId: number,
  raw: unknown,
  ctx: AuditContext,
) {
  const input = setStatusSchema.parse(raw);
  const ticket = await readTicket(actor, ticketId);

  const mine = ticket.authorId === actor.id;
  const allowed: TicketStatus[] = isStaff(actor) ? ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] : ["OPEN", "CLOSED"];
  if (!isStaff(actor) && !mine) throw new TicketError("not-yours", "That is not your ticket.");
  if (!allowed.includes(input.status)) {
    throw new TicketError("not-yours", "You cannot set that status.");
  }
  if (ticket.status === input.status) return { ok: true as const, unchanged: true };

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticketId }, data: { status: input.status } });
    await writeAudit(tx, ctx, {
      action: "TICKET_STATUS_CHANGED",
      targetType: "ticket",
      targetId: String(ticketId),
      before: { status: ticket.status },
      after: { status: input.status },
      reason: input.note || null,
    });
    for (const userId of await counterparties(tx, ticket, actor)) {
      await notify(tx, {
        userId,
        type: "TICKET_STATUS_CHANGED",
        data: { title: ticket.title, status: input.status },
        href: `/tickets/${ticketId}`,
      });
    }
  });

  return { ok: true as const };
}

/** Edit the opening post. The author may, while the ticket is still open;
 * staff may at any time (they retitle mis-filed tickets). */
export async function updateTicket(actor: Actor, ticketId: number, raw: unknown) {
  const input = updateTicketSchema.parse(raw);
  const ticket = await readTicket(actor, ticketId);
  if (!isStaff(actor)) {
    if (ticket.authorId !== actor.id) throw new TicketError("not-yours", "That is not your ticket.");
    if (ticket.status !== "OPEN") {
      throw new TicketError("ticket-closed", "This ticket is being worked on and can no longer be edited.");
    }
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.priority ? { priority: input.priority as TicketPriority } : {}),
    },
  });
  return { ok: true as const };
}

/** Hard delete, staff only (legacy: admin/supporter). Replies cascade. */
export async function deleteTicket(actor: Actor, ticketId: number) {
  await readTicket(actor, ticketId);
  if (!isStaff(actor)) throw new TicketError("not-yours", "Only support can delete a ticket.");
  await prisma.ticket.delete({ where: { id: ticketId } });
  return { ok: true as const };
}
