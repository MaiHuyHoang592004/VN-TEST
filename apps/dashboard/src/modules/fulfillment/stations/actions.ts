"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import { StorageError } from "../../core/storage.ts";
import { InvalidTransitionError } from "../orders/status.ts";
import * as stations from "./service.ts";
import { listTrackingGroups } from "./service/monitor.ts";

/**
 * The stations' web adapters: guard → validate → service → revalidate.
 *
 * Every one of them turns a refusal into DATA with a stable code rather than
 * letting it 500. A packer holding a parcel needs to be told "no basket is
 * free" or "type the word again" — an error digest in the console is not an
 * answer anyone on a floor can act on.
 */
async function stationCall<T>(fn: () => Promise<T>) {
  return withValidation(async () => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof stations.StationError) {
        return { ok: false as const, error: e.code, detail: e.detail };
      }
      if (e instanceof StorageError) return { ok: false as const, error: e.code };
      if (e instanceof InvalidTransitionError) {
        return { ok: false as const, error: e.code, from: e.from, to: e.to };
      }
      throw e;
    }
  });
}

/**
 * Re-read the parcel the station is holding.
 *
 * The station keeps ONE piece of state — the group — and every mutation
 * returns the fresh version of it. This exists for the mutations that do not:
 * a per-card status move goes through the shared /orders action, so the
 * station asks the server what the parcel looks like now rather than patching
 * its copy and hoping. A screen that disagrees with the database is how a real
 * parcel ships wrong.
 */
export async function refreshGroupAction(ref: { trackingNumber?: string; orderId?: number }) {
  const actor = await requirePermission("orders.status.update");
  return stations.getGroup(actor, ref);
}

/**
 * The monitor's "load more". The first page is server-rendered; this fetches
 * the next one by cursor without turning the whole table into a client fetch.
 */
export async function listGroupsAction(opts: {
  filter?: "open" | "ready" | "all";
  cursor?: number;
  limit?: number;
}) {
  const actor = await requirePermission("orders.status.update");
  return listTrackingGroups(actor, opts);
}

/** Scanning IS a status update — deliberately no separate "scan" permission. */
export async function recordScanAction(input: unknown) {
  const actor = await requirePermission("orders.status.update");
  return stationCall(async () => {
    const result = await stations.recordScan(actor, input, await auditContext(actor));
    // Only a real move needs the orders table rebuilt; a confirmation prompt
    // changed nothing.
    if (result.group) {
      revalidatePath("/fulfillment");
      revalidatePath("/orders");
    }
    return result;
  });
}

export async function fillOrderAction(input: unknown) {
  const actor = await requirePermission("orders.status.update");
  return stationCall(async () => {
    const result = await stations.fillOrder(actor, input, await auditContext(actor));
    revalidatePath("/fulfillment");
    revalidatePath("/orders");
    return result;
  });
}

/**
 * The proof photo arrives as FormData: a File cannot be serialised into a
 * plain server-action argument, and the station's camera produces a Blob.
 */
export async function attachProofAction(form: FormData) {
  const actor = await requirePermission("orders.status.update");
  return stationCall(async () => {
    const file = form.get("file");
    if (!(file instanceof File)) return { ok: false as const, error: "not-an-image" as const };
    const orderId = form.get("orderId");
    const result = await stations.attachProof(
      actor,
      {
        trackingNumber: (form.get("trackingNumber") as string) || undefined,
        orderId: orderId ? Number(orderId) : undefined,
      },
      file,
      await auditContext(actor),
      form.get("overwrite") === "true",
    );
    revalidatePath("/fulfillment");
    revalidatePath("/orders");
    return result;
  });
}

export async function completeHandoffAction(input: unknown) {
  const actor = await requirePermission("orders.status.update");
  return stationCall(async () => {
    const result = await stations.completeHandoff(actor, input, await auditContext(actor));
    revalidatePath("/fulfillment");
    revalidatePath("/orders");
    return result;
  });
}

export async function quickUpdateAction(input: unknown) {
  const actor = await requirePermission("orders.status.update");
  return stationCall(async () => {
    const result = await stations.quickUpdate(actor, input, await auditContext(actor));
    revalidatePath("/fulfillment/quick");
    revalidatePath("/orders");
    return result;
  });
}

/** A label costs money, so it asks for the money permission — not the one the
 * stations run on. */
export async function linkLabelAction(input: unknown) {
  const actor = await requirePermission("orders.labels.manage");
  return stationCall(async () => {
    const result = await stations.linkLabel(actor, input, await auditContext(actor));
    revalidatePath("/fulfillment");
    revalidatePath("/orders");
    return result;
  });
}
