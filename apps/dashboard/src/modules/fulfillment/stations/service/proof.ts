/**
 * The proof photo, and the handoff — how a parcel finishes and leaves.
 *
 * Both live here because they are the same moment on the floor: the last two
 * things anyone does to a box, in order, at the same bench.
 */
import { prisma, writeAudit, type AuditContext } from "@opcreative/db";

import { assertImageUpload, putObject, storageSlug } from "../../../core/storage.ts";
import { applyStatusChange, dispatchStatusWebhooks, type StatusChange } from "../../orders/service.ts";
import { canTransition } from "../../orders/status.ts";
import { StationError } from "./errors.ts";
import { freeBasket, rowsFor, toGroup, type Actor, type TrackingGroup } from "./group.ts";
import { attachProofSchema, handoffSchema, truncateTracking } from "../schema.ts";

export type ProofResult =
  | { requiresOverwrite: true; group?: undefined }
  | { group: TrackingGroup; requiresOverwrite?: undefined };

/**
 * Photograph the packed parcel; that photo IS the completion of production.
 *
 * The picture is the evidence in every "you shipped me the wrong thing"
 * dispute, which is why taking it and marking the work fulfilled are one act
 * and not two — a floor that CAN mark FULFILLED without a photo will.
 */
export async function attachProof(
  actor: Actor,
  raw: unknown,
  file: File,
  ctx: AuditContext,
  overwrite = false,
): Promise<ProofResult> {
  const ref = attachProofSchema.parse(raw);
  const rows = await rowsFor(actor, ref);
  if (!rows.length) throw new StationError("group-not-found", "Nothing matched that code.");

  // Re-photographing a parcel that is already fulfilled or gone is either a
  // correction or a mis-scan, and the station cannot tell which. Ask.
  const settled = rows.some((r) => r.status === "FULFILLED" || r.status === "SHIPPED");
  if ((settled || rows.some((r) => r.proofImageUrl)) && !overwrite) {
    return { requiresOverwrite: true };
  }

  assertImageUpload(file);
  const label = ref.trackingNumber
    ? truncateTracking(ref.trackingNumber)
    : String(ref.orderId ?? rows[0].id);
  const stored = await putObject({
    key: `proofs/${storageSlug(label)}-${Date.now()}.png`,
    body: await file.arrayBuffer(),
    contentType: file.type,
  });

  const changes = await prisma.$transaction(async (tx) => {
    const out: StatusChange[] = [];
    for (const column of rows) {
      // The storage KEY, kept beside the URL: doc 05 §A1b R3. Moving storage
      // providers later is a config change only if we can find the objects
      // again without parsing their URLs.
      const configs = {
        ...((column.configs as Record<string, unknown> | null) ?? {}),
        proofKey: stored.pathname,
      };
      await tx.order.update({
        where: { id: column.id },
        data: { proofImageUrl: stored.url, configs },
      });
      // Rows already at or past FULFILLED keep their status — the photo was
      // replaced, the parcel did not move backwards.
      if (canTransition(column.status, "FULFILLED")) {
        // The column we hand on carries the configs we just wrote, not the
        // snapshot from before it: a held order resuming here rewrites the bag
        // and would otherwise drop the key we are in the middle of storing.
        out.push(await applyStatusChange(tx, ctx, { ...column, configs }, "FULFILLED"));
      }
    }
    await freeBasket(tx, rows);
    await writeAudit(tx, ctx, {
      action: "ORDER_PROOF_UPLOADED",
      targetType: "order",
      targetId: rows.map((r) => r.id).join(","),
      after: { proofImageUrl: stored.url, proofKey: stored.pathname },
    });
    return out;
  });
  await dispatchStatusWebhooks(changes);

  return { group: toGroup(await rowsFor(actor, ref), new Set()) };
}

/**
 * The parcel leaves. A worker types the word "completed" to get here.
 *
 * The typing is not theatre: this is the last moment anyone looks inside the
 * box, and legacy's floor asked for the ritual precisely because a one-click
 * "Complete" was being pressed on parcels that were not packed.
 */
export async function completeHandoff(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
): Promise<{ labelUrl: string | null; group: TrackingGroup }> {
  const input = handoffSchema.parse(raw);
  if (input.confirmText.trim().toLowerCase() !== "completed") {
    throw new StationError("check-failed", "Type the word to confirm.");
  }

  // An order id identifies the parcel exactly; a tracking number only finds
  // one that already has a shipment. Prefer the id when the station has it.
  const ref = input.orderId
    ? { orderId: input.orderId }
    : { trackingNumber: input.trackingNumber };
  const rows = await rowsFor(actor, ref);
  if (!rows.length) {
    throw new StationError("group-not-found", "Nothing matched that tracking number.");
  }

  const notReady = rows.filter((r) => r.status !== "FULFILLED");
  if (notReady.length) {
    throw new StationError(
      "not-ready",
      "Every order in the parcel must be fulfilled first.",
      notReady.map((r) => ({ id: r.id, externalId: r.externalId, status: r.status })),
    );
  }

  const tracking = input.trackingNumber ? truncateTracking(input.trackingNumber) : null;
  const shippedAt = new Date();
  const changes = await prisma.$transaction(async (tx) => {
    const out: StatusChange[] = [];
    for (const column of rows) {
      out.push(await applyStatusChange(tx, ctx, column, "SHIPPED"));
      const existing = column.shipments[0];
      if (existing) {
        await tx.shipment.update({ where: { id: existing.id }, data: { shippedAt } });
      } else {
        // SHIPPED must never exist without a Shipment — otherwise the order is
        // "gone" with nothing recording where, and support has nothing to
        // answer the warehouse with.
        await tx.shipment.create({
          data: { orderId: column.id, trackingNumber: tracking, shippedAt },
        });
        await writeAudit(tx, ctx, {
          action: "SHIPMENT_CREATED",
          targetType: "order",
          targetId: String(column.id),
          after: { trackingNumber: tracking, shippedAt: shippedAt.toISOString() },
        });
      }
    }
    await freeBasket(tx, rows);
    return out;
  });
  await dispatchStatusWebhooks(changes);

  const group = toGroup(await rowsFor(actor, ref), new Set());
  return { labelUrl: group.labelUrl, group };
}
