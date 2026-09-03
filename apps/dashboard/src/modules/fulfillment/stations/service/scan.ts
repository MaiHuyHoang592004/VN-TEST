/**
 * THE SCAN — the station's front door.
 *
 * Finding the parcel and starting it are ONE act. Legacy had no separate
 * "begin production" button either, and adding one would mean a floor that
 * scans and then forgets to press it.
 */
import { prisma, type AuditContext } from "@opcreative/db";

import { applyStatusChange, dispatchStatusWebhooks, type StatusChange } from "../../orders/service.ts";
import { CONFIRM_THRESHOLD, StationError } from "./errors.ts";
import { refOf, rowsFor, toGroup, type Actor, type TrackingGroup } from "./group.ts";
import { scanSchema } from "../schema.ts";

export type ScanResult =
  | { requiresConfirmation: { count: number }; group?: undefined }
  | { group: TrackingGroup; requiresConfirmation?: undefined };

export async function recordScan(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
): Promise<ScanResult> {
  const input = scanSchema.parse(raw);
  const rows = await rowsFor(
    actor,
    input.mode === "tracking" ? { trackingNumber: input.value } : { orderId: Number(input.value) },
  );
  if (!rows.length) throw new StationError("group-not-found", "Nothing matched that code.");

  // The gate, BEFORE any write. A search that would move hundreds of orders is
  // a typo far more often than it is a real parcel.
  if (rows.length > CONFIRM_THRESHOLD && !input.confirmed) {
    return { requiresConfirmation: { count: rows.length } };
  }

  // Computed BEFORE the flip, or every column would report itself as scanned.
  // "Was this parcel already worked?" is what the warning dialog asks, and
  // legacy stored the answer as a row that could disagree with the status.
  const wasScanned = new Set(rows.filter((r) => r.status !== "ASSIGNED").map((r) => r.id));

  const fresh = rows.filter((r) => r.status === "ASSIGNED");
  if (fresh.length) {
    const changes = await prisma.$transaction(async (tx) => {
      const out: StatusChange[] = [];
      for (const column of fresh) {
        out.push(await applyStatusChange(tx, ctx, column, "IN_PRODUCTION"));
        // Who worked this. Stamped once and never overwritten — the first
        // person to touch it owns it, and a later re-scan by someone else
        // should not quietly rewrite that history.
        if (!column.assignedToId) {
          await tx.order.update({ where: { id: column.id }, data: { assignedToId: actor.id } });
        }
      }
      return out;
    });
    await dispatchStatusWebhooks(changes);
  }

  return { group: toGroup(await rowsFor(actor, refOf(rows)), wasScanned) };
}
