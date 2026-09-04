/**
 * Voiding a bought label.
 *
 * Two things stay separate on purpose:
 *   1. The CARRIER side — did KiloShips actually cancel it and, eventually,
 *      refund the postage? That is `carrierVoided` below, and it is false
 *      whenever the provider has no `void` (see kiloships.ts's ponytail) or
 *      the carrier call itself fails.
 *   2. Our OWN record — voidedAt/voidReason on the Shipment. Set
 *      unconditionally once an operator confirms the void, because the
 *      point of voiding is that OUR system stops treating the label as
 *      live (offering it in downloads, refusing a reship as "already has a
 *      label") even on a day the carrier call cannot be confirmed.
 *
 * Never claims a refund happened — that is a balance operation
 * (orders.refund) this function does not touch. A carrier's actual refund
 * timeline is its own business and nothing here asserts it happened.
 */
import { prisma, writeAudit, orderScope, type AuditContext } from "@gwprint/db";

import { type Actor } from "../stations/service/group.ts";
import { kiloShips } from "./kiloships.ts";

export type VoidLabelErrorCode = "not-found" | "already-voided" | "no-label" | "reason-required";

export class VoidLabelError extends Error {
  readonly code: VoidLabelErrorCode;
  constructor(code: VoidLabelErrorCode, message: string) {
    super(message);
    this.name = "VoidLabelError";
    this.code = code;
  }
}

export async function voidLabel(
  actor: Actor,
  shipmentId: number,
  reason: string,
  ctx: AuditContext,
): Promise<{ ok: true; carrierVoided: boolean; carrierError?: string }> {
  if (!reason.trim()) throw new VoidLabelError("reason-required", "Say why this label is being voided.");

  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, order: await orderScope(actor) },
    select: {
      id: true,
      orderId: true,
      trackingNumber: true,
      labelUrl: true,
      voidedAt: true,
      configs: true,
    },
  });
  if (!shipment) throw new VoidLabelError("not-found", "No such label.");
  if (shipment.voidedAt) throw new VoidLabelError("already-voided", "That label is already void.");
  if (!shipment.labelUrl) throw new VoidLabelError("no-label", "That shipment has no label to void.");

  let carrierVoided = false;
  let carrierError: string | undefined;
  if (kiloShips.void) {
    try {
      const referenceId = (shipment.configs as { referenceId?: string } | null)?.referenceId;
      await kiloShips.void({ trackingNumber: shipment.trackingNumber ?? "", referenceId });
      carrierVoided = true;
    } catch (e) {
      // The carrier call failing does not block the LOCAL void — see the
      // file doc-comment. The reason names why the carrier side is unclear.
      carrierError = e instanceof Error ? e.message : String(e);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipment.id },
      data: { voidedAt: new Date(), voidReason: reason },
    });
    await writeAudit(tx, ctx, {
      action: "LABEL_VOIDED",
      targetType: "order",
      targetId: String(shipment.orderId),
      after: {
        trackingNumber: shipment.trackingNumber,
        reason,
        carrierVoided,
        carrierError: carrierError ?? null,
      },
    });
  });

  return { ok: true, carrierVoided, carrierError };
}
