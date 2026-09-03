"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { withValidation } from "../../core/action-result.ts";
import { StorageError } from "../../core/storage.ts";
import { RequestError } from "./service.ts";
import * as requests from "./service.ts";

/** Coded refusals become the {ok:false,error} shape the dialogs render; the
 * detail rides along so "over cap" can name the cap. */
async function guarded<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RequestError) return { ok: false as const, error: e.code, detail: e.detail };
    if (e instanceof StorageError) return { ok: false as const, error: e.code };
    throw e;
  }
}

const refresh = () => {
  revalidatePath("/profile/billing");
  revalidatePath("/admin/transactions");
};

/** Files do not survive a plain server-action argument, so evidence arrives as
 * FormData — the same shape ticket attachments and dock photos use. */
const filesOf = (formData: FormData) =>
  formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

/**
 * Guarded on `transactions.read.own`: the capability to HAVE a balance is what
 * makes someone able to ask about it. Nothing here moves money, so a stricter
 * grant would only mean sellers cannot use their own wallet.
 */
export async function requestTopUpAction(formData: FormData) {
  const actor = await requirePermission("transactions.read.own");
  const result = await withValidation(() =>
    guarded(() =>
      requests.requestTopUp(
        actor,
        {
          amount: String(formData.get("amount") ?? ""),
          method: String(formData.get("method") ?? "bank-transfer"),
          note: String(formData.get("note") ?? ""),
        },
        filesOf(formData),
      ),
    ),
  );
  refresh();
  return result;
}

export async function requestRefundAction(formData: FormData) {
  const actor = await requirePermission("transactions.read.own");
  const orderIds = String(formData.get("orderIds") ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
  const amount = String(formData.get("amount") ?? "").trim();

  const result = await withValidation(() =>
    guarded(() =>
      requests.requestRefund(
        actor,
        {
          orderIds,
          reason: String(formData.get("reason") ?? ""),
          ...(amount ? { amount } : {}),
        },
        filesOf(formData),
      ),
    ),
  );
  refresh();
  return result;
}
