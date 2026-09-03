"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import { StorageError } from "../../core/storage.ts";
import { InventoryError } from "../stock/service.ts";
import * as receipts from "./service.ts";

/** Coded refusals become the {ok:false,error} shape the forms already render;
 * anything else is a real fault and keeps throwing. */
async function guarded<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InventoryError) return { ok: false as const, error: e.code };
    if (e instanceof StorageError) return { ok: false as const, error: e.code };
    throw e;
  }
}

const refresh = () => {
  revalidatePath("/inventory/receipts");
  revalidatePath("/inventory");
};

export async function createReceiptAction(input: unknown) {
  const actor = await requirePermission("inventory.receipts.create");
  const ctx = await auditContext(actor);
  const result = await withValidation(() => guarded(() => receipts.createReceipt(actor, input, ctx)));
  refresh();
  return result;
}

export async function updateReceiptAction(id: number, input: unknown) {
  const actor = await requirePermission("inventory.receipts.create");
  const ctx = await auditContext(actor);
  const result = await withValidation(() =>
    guarded(() => receipts.updateReceipt(actor, id, input, ctx)),
  );
  refresh();
  return result;
}

export async function receiveShipmentAction(input: unknown) {
  const actor = await requirePermission("inventory.receipts.receive");
  const ctx = await auditContext(actor);
  const result = await withValidation(() =>
    guarded(() => receipts.receiveShipment(actor, input, ctx)),
  );
  refresh();
  return result;
}

export async function rejectReceiptAction(input: unknown) {
  const actor = await requirePermission("inventory.receipts.receive");
  const ctx = await auditContext(actor);
  const result = await withValidation(() => guarded(() => receipts.rejectReceipt(actor, input, ctx)));
  refresh();
  return result;
}

/**
 * Evidence arrives as FormData because Files do not survive a plain server
 * action argument — same shape as the station's proof upload.
 */
export async function addEvidenceAction(formData: FormData) {
  const actor = await requirePermission("inventory.receipts.receive");
  const ctx = await auditContext(actor);
  const receiptId = Number(formData.get("receiptId"));
  const shipmentId = Number(formData.get("shipmentId"));
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  const result = await guarded(() =>
    receipts.addEvidence(actor, receiptId, shipmentId, files, ctx),
  );
  refresh();
  return result;
}

/** Read-only, but an action because the detail dialog reloads itself after a
 * receive without navigating away from the column the user is working on. */
export async function getReceiptAction(id: number) {
  const actor = await requirePermission("inventory.read");
  return receipts.getReceipt(actor, id);
}
