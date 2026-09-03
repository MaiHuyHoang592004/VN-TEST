"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { StorageError } from "../../core/storage.ts";
import { LabelProviderError } from "./provider.ts";
import * as labels from "./service.ts";

/**
 * Label actions. All three ask for orders.labels.manage rather than the
 * station's permission: these spend money with a carrier, and moving an order
 * along the map does not.
 */

/** Read-only. Shows what a purchase WOULD do, before any money moves. */
export async function previewLabelsAction(orderIds: number[], allowMultiple = false) {
  const actor = await requirePermission("orders.labels.manage");
  return labels.previewLabels(actor, orderIds, allowMultiple);
}

export async function purchaseLabelsAction(orderIds: number[], allowMultiple = false) {
  const actor = await requirePermission("orders.labels.manage");
  try {
    const result = await labels.purchaseLabels(
      actor,
      orderIds,
      await auditContext(actor),
      allowMultiple,
    );
    revalidatePath("/orders");
    return { ok: true as const, ...result };
  } catch (e) {
    if (e instanceof LabelProviderError) return { ok: false as const, error: e.code };
    throw e;
  }
}

/**
 * Build the zip and hand back a link. It returns a URL rather than streaming
 * bytes through the action: a 200-label bundle is tens of megabytes, and a
 * Server Action response is not the place for it — the file lands in storage
 * and the browser fetches it like any other download.
 */
export async function downloadLabelsAction(input: {
  orderIds?: number[];
  from?: string;
  to?: string;
}) {
  const actor = await requirePermission("orders.labels.manage");
  try {
    const result = await labels.downloadLabels(
      actor,
      {
        orderIds: input.orderIds,
        from: input.from ? new Date(input.from) : undefined,
        to: input.to ? new Date(input.to) : undefined,
      },
    );
    return { ok: true as const, ...result };
  } catch (e) {
    // A missing storage driver is the likely failure on a fresh deploy, and it
    // deserves the same readable code as anything else.
    if (e instanceof StorageError) return { ok: false as const, error: e.code };
    throw e;
  }
}

/** Whether the Buy labels button should exist at all. */
export async function labelsEnabledAction() {
  await requirePermission("orders.labels.manage");
  return labels.labelsEnabled();
}
