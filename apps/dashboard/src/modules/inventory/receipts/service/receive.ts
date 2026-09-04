/**
 * Booking in what actually turned up — THE invariant of this phase.
 *
 * Receiving is DELTA-BASED and MONOTONIC. A line remembers how much has been
 * booked in so far; a receive says what the total now is; stock moves by the
 * difference. Receive 5 of 10 today and 8 tomorrow and the shelf gains 5 then
 * 3, never 5 then 8. That is what makes a shipment safe to receive across
 * several sessions, and safe to re-submit when someone double-clicks.
 *
 * The delta is computed under SELECT … FOR UPDATE on the line column. Without the
 * lock, two receives racing on one shipment both read "5 received", both
 * compute a delta from 5, and the shelf gains the difference twice. The lock is
 * only exercised concurrently — every sequential test passes without it, which
 * is exactly why doc 04 C1 insisted the test use Promise.all.
 */
import { prisma, writeAudit, Prisma, type AuditContext } from "@gwprint/db";

import {
  InventoryError,
  addToOnHand,
  assertSite,
  resolveNeeded,
  writeMovement,
  type ItemRef,
  type Actor,
  type Tx,
} from "../../stock/service.ts";
import { receiveShipmentSchema, rejectReceiptSchema } from "../schema.ts";

/** A shipment can still take goods only from these two states. */
const OPEN_SHIPMENT = ["PENDING", "PARTIAL_RECEIVED"] as const;
const OPEN_RECEIPT = ["PENDING", "PARTIAL"] as const;

type LockedLine = {
  id: number;
  material_id: number | null;
  product_variant_id: number | null;
  requested_quantity: number;
  received_quantity: number | null;
  rejected_quantity: number;
};

/**
 * Lock every line of the shipment and read its current numbers.
 *
 * Ordered by id so two concurrent receives take the locks in the same
 * sequence — unordered locking of the same set from two transactions is a
 * deadlock waiting for a busy day.
 */
function lockLines(tx: Tx, shipmentId: number) {
  return tx.$queryRaw<LockedLine[]>(Prisma.sql`
    SELECT id, material_id, product_variant_id,
           requested_quantity, received_quantity, rejected_quantity
      FROM stock_receipt_lines
     WHERE shipment_id = ${shipmentId}
     ORDER BY id
       FOR UPDATE
  `);
}

const refOf = (line: LockedLine): ItemRef =>
  line.material_id != null
    ? { itemType: "MATERIAL", itemId: line.material_id }
    : { itemType: "PRODUCT", itemId: line.product_variant_id! };

export async function receiveShipment(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = receiveShipmentSchema.parse(raw);

  const shipment = await prisma.stockReceiptShipment.findFirst({
    where: { id: input.shipmentId, receiptId: input.receiptId },
    select: {
      id: true,
      status: true,
      receipt: { select: { id: true, code: true, status: true, warehouseId: true } },
    },
  });
  if (!shipment) throw new InventoryError("not-found", "That shipment no longer exists.");

  // ADMIN receives for any site (legacy: admin passed assertCanApproveReceipt
  // anywhere, everyone else only their own). assertSite encodes exactly that.
  await assertSite(actor, shipment.receipt.warehouseId);

  if (!OPEN_SHIPMENT.includes(shipment.status as (typeof OPEN_SHIPMENT)[number])) {
    throw new InventoryError("not-receivable", "This shipment is already settled.", {
      status: shipment.status,
    });
  }
  if (!OPEN_RECEIPT.includes(shipment.receipt.status as (typeof OPEN_RECEIPT)[number])) {
    throw new InventoryError("not-receivable", "This receipt is already settled.", {
      status: shipment.receipt.status,
    });
  }

  const warehouseId = shipment.receipt.warehouseId;

  return prisma.$transaction(async (tx) => {
    const locked = await lockLines(tx, input.shipmentId);
    const byId = new Map(locked.map((l) => [l.id, l]));

    // Every line of the shipment must be answered. A partial payload leaves
    // "what about line 3?" unanswered, and that answer is what decides whether
    // the shipment is finished.
    const missing = locked.filter((l) => !input.lines.some((i) => i.lineId === l.id));
    if (missing.length) {
      throw new InventoryError("not-found", "Every line of the shipment must be submitted.", {
        missing: missing.map((l) => l.id),
      });
    }

    const applied: { lineId: number; delta: number; received: number; rejected: number }[] = [];

    for (const submitted of input.lines) {
      const line = byId.get(submitted.lineId);
      if (!line) {
        throw new InventoryError("not-found", "That line is not on this shipment.", {
          lineId: submitted.lineId,
        });
      }

      const current = line.received_quantity ?? 0;
      if (submitted.receivedQuantity < current) {
        throw new InventoryError(
          "received-below-current",
          "Received quantity cannot go down — goods already booked in are on the shelf.",
          { lineId: line.id, current, submitted: submitted.receivedQuantity },
        );
      }

      const delta = submitted.receivedQuantity - current;

      await tx.stockReceiptLine.update({
        where: { id: line.id },
        data: {
          receivedQuantity: submitted.receivedQuantity,
          rejectedQuantity: submitted.rejectedQuantity,
        },
      });

      // Zero delta still updates the line (a rejected count may have changed)
      // but must not write a movement: a ledger column saying "+0" is noise that
      // makes a re-submission look like a real event.
      if (delta > 0) {
        const ref = refOf(line);
        await addToOnHand(tx, ref, warehouseId, delta);
        await writeMovement(tx, {
          ref,
          warehouseId,
          type: "RECEIPT",
          quantity: delta,
          actorId: actor.id,
          referenceType: "stock_receipt_shipment",
          referenceId: String(input.shipmentId),
        });
        // Goods arriving can settle a shortage recorded when stock ran out.
        await resolveNeeded(tx, ref, warehouseId, actor.id);
      }

      applied.push({
        lineId: line.id,
        delta,
        received: submitted.receivedQuantity,
        rejected: submitted.rejectedQuantity,
      });
    }

    const status = await rollUpStatuses(tx, input.receiptId, input.shipmentId, actor.id);

    await writeAudit(tx, ctx, {
      action: "RECEIPT_RECEIVED",
      targetType: "receipt",
      targetId: String(input.receiptId),
      after: {
        code: shipment.receipt.code,
        shipmentId: input.shipmentId,
        // The DELTAS, not the totals: the audit answers "what happened in this
        // session", which the totals alone cannot.
        lines: applied,
        shipmentStatus: status.shipment,
        receiptStatus: status.receipt,
      },
    });

    return { ok: true as const, ...status };
  });
}

/**
 * Recompute the shipment from its lines, then the receipt from its shipments.
 *
 * Derived, never accumulated: statuses are read back off the rows every time
 * rather than nudged along, so a re-receive that changes nothing lands on the
 * same answer instead of stepping a state machine twice.
 */
async function rollUpStatuses(
  tx: Tx,
  receiptId: number,
  shipmentId: number,
  actorId: string,
): Promise<{ shipment: string; receipt: string }> {
  const lines = await tx.stockReceiptLine.findMany({
    where: { shipmentId },
    select: { requestedQuantity: true, receivedQuantity: true, rejectedQuantity: true },
  });

  // A line is settled once received + rejected covers what was asked for —
  // rejected goods are accounted for, they just never entered stock.
  const settled = lines.every(
    (l) => (l.receivedQuantity ?? 0) + l.rejectedQuantity >= l.requestedQuantity,
  );
  const shipmentStatus = settled ? "RECEIVED" : "PARTIAL_RECEIVED";

  await tx.stockReceiptShipment.update({
    where: { id: shipmentId },
    data: {
      status: shipmentStatus,
      receivedAt: settled ? new Date() : null,
    },
  });

  const siblings = await tx.stockReceiptShipment.findMany({
    where: { receiptId },
    select: { status: true },
  });
  const allDone = siblings.every((s) => s.status === "RECEIVED");
  const receiptStatus = allDone ? "COMPLETE" : "PARTIAL";

  await tx.stockReceipt.update({
    where: { id: receiptId },
    data: {
      status: receiptStatus,
      // approvedBy is set when the LAST shipment lands: on this workflow,
      // completing the receipt is the approval. Legacy had a separate approve
      // endpoint that no screen ever called.
      ...(allDone ? { approvedById: actorId, approvedAt: new Date() } : {}),
    },
  });

  return { shipment: shipmentStatus, receipt: receiptStatus };
}

/**
 * Refuse a receipt outright.
 *
 * NO stock effect, ever — rejected goods never entered stock, so there is
 * nothing to take back out. Anything already received stays received and stays
 * on the shelf; this closes the paperwork, it does not reverse a delivery.
 */
export async function rejectReceipt(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = rejectReceiptSchema.parse(raw);

  const receipt = await prisma.stockReceipt.findUnique({
    where: { id: input.receiptId },
    select: { id: true, code: true, status: true, warehouseId: true },
  });
  if (!receipt) throw new InventoryError("not-found", "That receipt no longer exists.");
  await assertSite(actor, receipt.warehouseId);

  if (receipt.status === "COMPLETE" || receipt.status === "REJECTED") {
    throw new InventoryError("not-receivable", "This receipt is already settled.", {
      status: receipt.status,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockReceipt.update({
      where: { id: receipt.id },
      data: { status: "REJECTED", rejectReason: input.reason || null },
    });
    // Only the shipments still in flight. One already RECEIVED describes goods
    // that are physically here, and rewriting its status would make the ledger
    // and the paperwork disagree.
    await tx.stockReceiptShipment.updateMany({
      where: { receiptId: receipt.id, status: { in: [...OPEN_SHIPMENT] } },
      data: { status: "REJECTED" },
    });
    await writeAudit(tx, ctx, {
      action: "RECEIPT_REJECTED",
      targetType: "receipt",
      targetId: String(receipt.id),
      before: { status: receipt.status },
      after: { status: "REJECTED", code: receipt.code },
      reason: input.reason || null,
    });
  });

  return { ok: true as const };
}
