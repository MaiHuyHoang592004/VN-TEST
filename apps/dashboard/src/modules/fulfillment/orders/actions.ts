"use server";

import { revalidatePath } from "next/cache";

import { requireAnyPermission, requirePermission } from "../../core/guard.ts";
import { StorageError } from "../../core/storage.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import * as orders from "./service.ts";
import { InvalidTransitionError } from "./status.ts";
import type { FulfillmentStatus } from "@gwprint/db";

export async function createOrderAction(input: unknown, owner?: string) {
  const actor = await requirePermission("orders.create");
  return withValidation(async () => {
    const result = await orders.createOrder(actor, input, await auditContext(actor), owner ?? actor.id);
    revalidatePath("/orders");
    return result;
  });
}

/** The spreadsheet importer's endpoint. Rows are validated one at a time by
 * the SAME schema the form uses, so "column 4 is invalid" means exactly what the
 * form would have said. */
export async function createOrdersAction(rows: unknown[], owner?: string) {
  const actor = await requirePermission("orders.create");
  const result = await orders.createOrders(actor, rows, await auditContext(actor), owner ?? actor.id);
  revalidatePath("/orders");
  return result;
}

export async function updateOrderAction(id: number, input: unknown) {
  const actor = await requirePermission("orders.update");
  return withValidation(async () => {
    const result = await orders.updateOrder(actor, id, input, await auditContext(actor));
    revalidatePath("/orders");
    return result;
  });
}

/** A rejected transition comes back as DATA with a stable code, not a 500 —
 * the menu is built from the same map, so this fires only on a stale page. */
export async function updateStatusAction(id: number, to: FulfillmentStatus, note?: string) {
  const actor = await requirePermission("orders.status.update");
  try {
    const result = await orders.updateStatus(actor, id, to, await auditContext(actor), note);
    revalidatePath("/orders");
    return result;
  } catch (e) {
    if (e instanceof InvalidTransitionError) {
      return { ok: false as const, error: e.code, from: e.from, to: e.to };
    }
    throw e;
  }
}

export async function assignOrdersAction(input: unknown) {
  const actor = await requirePermission("orders.assign");
  return withValidation(async () => {
    const result = await orders.assignOrders(actor, input, await auditContext(actor));
    revalidatePath("/orders");
    return result;
  });
}

export async function deleteOrdersAction(ids: number[]) {
  const actor = await requirePermission("orders.delete");
  const result = await orders.deleteOrders(actor, ids, await auditContext(actor));
  revalidatePath("/orders");
  return result;
}

/** Read-only preview for the assign dialog — what each seller would be charged
 * and what their balance becomes. Gated on orders.assign because it exposes
 * balances. */
export async function previewAssignmentAction(orderIds: number[]) {
  const actor = await requirePermission("orders.assign");
  return orders.previewAssignment(actor, orderIds);
}

/** What these orders are worth back. Gated on orders.refund rather than a read
 * grant: the quote exposes what a seller paid, and only the person who could
 * act on it needs to see it. */
export async function refundQuoteAction(orderIds: number[]) {
  const actor = await requirePermission("orders.refund");
  return orders.refundQuote(actor, orderIds);
}

/**
 * Pay the sellers back and cancel the orders. The idempotency key comes from
 * the dialog and is generated once when it opens, so a double-click or a retry
 * credits exactly once — the UNIQUE constraint on the ledger column is what
 * enforces it, not this action.
 */
export async function refundOrdersAction(input: {
  orderIds: number[];
  idempotencyKey: string;
  reason?: string;
}) {
  const actor = await requirePermission("orders.refund");
  return withValidation(async () => {
    const result = await orders.adminRefundOrders(actor, input, await auditContext(actor));
    revalidatePath("/orders");
    revalidatePath("/admin/transactions");
    return result;
  });
}

/**
 * The table, as a spreadsheet. Guarded on the read grants rather than a
 * separate export permission: anyone who can see these rows on screen can
 * already copy them, and the MONEY columns are gated inside the service by
 * transactions.read.all — server-side, unlike legacy's client-side pruning.
 */
export async function exportOrdersAction(filter: unknown) {
  const actor = await requireAnyPermission(
    "orders.read.own",
    "orders.read.customer",
    "orders.read.all",
  );
  return withValidation(() => orders.exportOrders(actor, filter as never));
}

/** Re-price unpaid orders against today's price list. Paid ones are refused
 * by name — see the service for why legacy's version could desync the ledger. */
export async function recalcOrdersAction(ids: number[]) {
  const actor = await requirePermission("orders.update");
  const ctx = await auditContext(actor);
  try {
    const result = await orders.recalcOrders(actor, ids, ctx);
    revalidatePath("/orders");
    return result;
  } catch (e) {
    if (e instanceof orders.ArtworkError) {
      return { ok: false as const, error: e.code, detail: e.detail };
    }
    throw e;
  }
}

/**
 * Attach a design and/or a mockup to one order. FormData, because files do not
 * survive a plain server-action argument.
 */
export async function setOrderArtworkAction(formData: FormData) {
  const actor = await requirePermission("orders.update");
  const ctx = await auditContext(actor);
  const orderId = Number(formData.get("orderId"));
  const file = (key: string) => {
    const value = formData.get(key);
    return value instanceof File && value.size > 0 ? value : undefined;
  };

  try {
    const result = await orders.setOrderArtwork(
      actor,
      orderId,
      {
        designUrl: String(formData.get("designUrl") ?? ""),
        mockupUrl: String(formData.get("mockupUrl") ?? ""),
        mockupName: String(formData.get("mockupName") ?? ""),
      },
      { design: file("designFile"), mockup: file("mockupFile") },
      ctx,
    );
    revalidatePath("/orders");
    return result;
  } catch (e) {
    if (e instanceof orders.ArtworkError) {
      return { ok: false as const, error: e.code, detail: e.detail };
    }
    if (e instanceof StorageError) return { ok: false as const, error: e.code };
    throw e;
  }
}
