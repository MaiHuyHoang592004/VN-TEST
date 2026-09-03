/**
 * Photos taken at the dock, attached to the shipment they document.
 *
 * Stored as a Json array on the shipment rather than its own table: nothing
 * ever queries across evidence, it is only read back with its shipment, and a
 * table would buy a join for no question anyone asks.
 *
 * The validate-then-store half lives in core/storage.ts (`storeImages`) because
 * ticket attachments need exactly the same rules — one copy, one place to fix.
 */
import { prisma, type AuditContext } from "@opcreative/db";

import { storeImages, type StoredUpload } from "../../../core/storage.ts";
import { InventoryError, assertSite, type Actor } from "../../stock/service.ts";

export type EvidenceFile = StoredUpload;

export async function addEvidence(
  actor: Actor,
  receiptId: number,
  shipmentId: number,
  files: File[],
  _ctx: AuditContext,
) {
  if (files.length === 0) return { ok: true as const, files: [] };

  const shipment = await prisma.stockReceiptShipment.findFirst({
    where: { id: shipmentId, receiptId },
    select: { id: true, evidence: true, receipt: { select: { warehouseId: true } } },
  });
  if (!shipment) throw new InventoryError("not-found", "That shipment no longer exists.");
  await assertSite(actor, shipment.receipt.warehouseId);

  const stored = await storeImages(files, {
    prefix: `receipts/receipt-${receiptId}-shipment-${shipmentId}-`,
    uploadedById: actor.id,
  });

  // APPEND. Read-modify-write is a lost-update race if two docks upload at the
  // same instant; acceptable because the loser is a photo, not a count, and
  // the alternative is a table for data nobody queries.
  // ponytail: read-modify-write on a Json row. Ceiling = concurrent uploads
  // to ONE shipment can drop one batch. Upgrade path: jsonb `||` in raw SQL.
  const existing = Array.isArray(shipment.evidence) ? (shipment.evidence as unknown[]) : [];
  await prisma.stockReceiptShipment.update({
    where: { id: shipmentId },
    data: { evidence: [...existing, ...stored] as never },
  });

  return { ok: true as const, files: stored };
}
