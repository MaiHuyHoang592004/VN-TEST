/**
 * Quick scan — set one status on everything behind one scanned barcode.
 *
 * Port of legacy's update-by-keyword with its two worst properties removed.
 * Legacy matched the keyword against FIFTEEN columns, including free-text
 * notes, so a word someone typed in a note could drag unrelated orders into a
 * bulk update; and it wrote the new status with no validation at all, which is
 * how orders travelled from DELIVERED back to PENDING.
 *
 * Here the keyword is a tracking number and nothing else, and every column is
 * checked against the transition map on its own: the legal ones move, the
 * illegal ones come back NAMED, with a code. Legacy reported everything it
 * touched as updated, including the rows it had silently mangled.
 */
import { prisma, type AuditContext, type FulfillmentStatus } from "@opcreative/db";

import { applyStatusChange, dispatchStatusWebhooks, type StatusChange } from "../../orders/service.ts";
import { InvalidTransitionError } from "../../orders/status.ts";
import { StationError } from "./errors.ts";
import { rowsFor, toGroup, type Actor, type TrackingGroup } from "./group.ts";
import { quickUpdateSchema } from "../schema.ts";

export type QuickUpdateResult = {
  updated: number;
  skipped: Array<{ id: number; externalId: string | null; reason: string }>;
  rows: TrackingGroup["orders"];
  trackingNumber: string | null;
  customer: string | null;
};

export async function quickUpdate(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
): Promise<QuickUpdateResult> {
  const input = quickUpdateSchema.parse(raw);
  const ref = { trackingNumber: input.keyword };
  const rows = await rowsFor(actor, ref);
  if (!rows.length) throw new StationError("group-not-found", "Nothing matched that code.");

  const to = input.to as FulfillmentStatus;
  const skipped: QuickUpdateResult["skipped"] = [];
  const changes = await prisma.$transaction(async (tx) => {
    const out: StatusChange[] = [];
    for (const column of rows) {
      try {
        out.push(await applyStatusChange(tx, ctx, column, to, input.note));
      } catch (e) {
        // A refusal is DATA here, not a failure: one ineligible column of a parcel
        // must not abandon the rest. Anything that is NOT the transition map
        // saying no is a real error and still escapes.
        if (!(e instanceof InvalidTransitionError)) throw e;
        skipped.push({ id: column.id, externalId: column.externalId, reason: e.code });
      }
    }
    return out;
  });
  await dispatchStatusWebhooks(changes);

  const group = toGroup(await rowsFor(actor, ref), new Set());
  return {
    updated: changes.length,
    skipped,
    rows: group.orders,
    trackingNumber: group.trackingNumber,
    customer: group.customer.name,
  };
}
