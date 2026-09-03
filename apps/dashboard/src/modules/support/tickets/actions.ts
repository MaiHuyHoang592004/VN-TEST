"use server";

import { revalidatePath } from "next/cache";

import { requireAnyPermission, requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import { StorageError } from "../../core/storage.ts";
import { TicketError } from "./service.ts";
import * as tickets from "./service.ts";

/** Coded refusals become the {ok:false,error} shape the forms already render;
 * anything else is a real fault and keeps throwing. */
async function guarded<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TicketError) return { ok: false as const, error: e.code };
    if (e instanceof StorageError) return { ok: false as const, error: e.code };
    throw e;
  }
}

/** Anyone who can see tickets at all can act inside their own scope; the
 * service decides what "their own" means for each call. */
const actorGuard = () => requireAnyPermission("tickets.read.own", "tickets.read.all");

const refresh = (id?: number) => {
  revalidatePath("/tickets");
  if (id) revalidatePath(`/tickets/${id}`);
};

/**
 * Files do not survive a plain server-action argument, so the create and reply
 * actions take FormData — same shape as the station's proof upload.
 */
const filesOf = (formData: FormData) =>
  formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

export async function createTicketAction(formData: FormData) {
  const actor = await actorGuard();
  const orderId = Number(formData.get("orderId"));
  const result = await withValidation(() =>
    guarded(() =>
      tickets.createTicket(
        actor,
        {
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
          reason: String(formData.get("reason") ?? "other"),
          priority: String(formData.get("priority") ?? "MEDIUM"),
          ...(orderId ? { orderId } : {}),
        },
        filesOf(formData),
      ),
    ),
  );
  refresh();
  return result;
}

export async function replyTicketAction(formData: FormData) {
  const actor = await actorGuard();
  const ticketId = Number(formData.get("ticketId"));
  const result = await withValidation(() =>
    guarded(() =>
      tickets.replyTicket(
        actor,
        ticketId,
        { content: String(formData.get("content") ?? "") },
        filesOf(formData),
      ),
    ),
  );
  refresh(ticketId);
  return result;
}

export async function setTicketStatusAction(id: number, input: unknown) {
  const actor = await actorGuard();
  const ctx = await auditContext(actor);
  const result = await withValidation(() =>
    guarded(() => tickets.setTicketStatus(actor, id, input, ctx)),
  );
  refresh(id);
  return result;
}

export async function updateTicketAction(id: number, input: unknown) {
  const actor = await actorGuard();
  const result = await withValidation(() => guarded(() => tickets.updateTicket(actor, id, input)));
  refresh(id);
  return result;
}

export async function deleteTicketAction(id: number) {
  const actor = await requirePermission("tickets.manage");
  const result = await guarded(() => tickets.deleteTicket(actor, id));
  refresh();
  return result;
}
