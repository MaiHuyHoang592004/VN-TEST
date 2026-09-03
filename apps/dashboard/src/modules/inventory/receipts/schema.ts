import { z } from "zod";

/**
 * A line points at exactly ONE thing — the same XOR the database enforces with
 * a CHECK constraint. Validating it here too means the floor gets a sentence
 * instead of a 500 when a form goes wrong, and the constraint stays as the
 * thing that makes it true rather than the thing that reports it.
 */
export const receiptLineSchema = z
  .object({
    materialId: z.number().int().positive().optional(),
    productVariantId: z.number().int().positive().optional(),
    requestedQuantity: z.number().int().positive("Enter at least 1"),
    unitPrice: z.number().nonnegative().optional(),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((l) => Boolean(l.materialId) !== Boolean(l.productVariantId), {
    message: "A line names one material or one variant, never both",
  });

export const receiptShipmentSchema = z.object({
  vendorId: z.number().int().positive().optional(),
  /** Defaults to "S1", "S2"… in order — vendors reuse their own numbering
   * across customers, so this is unique within the receipt and nowhere else. */
  shipmentCode: z.string().trim().max(40).optional().or(z.literal("")),
  trackingNumber: z.string().trim().max(120).optional().or(z.literal("")),
  carrier: z.string().trim().max(80).optional().or(z.literal("")),
  trackingUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  /** ISO date from the form; the ETA tiles read it. */
  expectedArrivalAt: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  lines: z.array(receiptLineSchema).min(1, "A shipment needs at least one line"),
});

export const createReceiptSchema = z.object({
  itemType: z.enum(["MATERIAL", "PRODUCT"]),
  warehouseId: z.number().int().positive(),
  provider: z.string().trim().max(120).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  shipments: z.array(receiptShipmentSchema).min(1, "A receipt needs at least one shipment"),
});
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

/**
 * What the floor types when a shipment lands. EVERY line of the shipment is
 * supplied, not just the changed ones — a partial payload would make "what did
 * you decide about line 3?" ambiguous, and the answer decides whether the
 * shipment is finished.
 */
export const receiveShipmentSchema = z.object({
  receiptId: z.number().int().positive(),
  shipmentId: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        lineId: z.number().int().positive(),
        receivedQuantity: z.number().int().nonnegative(),
        rejectedQuantity: z.number().int().nonnegative().default(0),
      }),
    )
    .min(1),
});
export type ReceiveShipmentInput = z.infer<typeof receiveShipmentSchema>;

export const rejectReceiptSchema = z.object({
  receiptId: z.number().int().positive(),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

/** Report window. Capped so a stray "?days=9999" cannot scan the whole table. */
export const reportSchema = z.object({
  upcomingDays: z.number().int().positive().max(90).default(14),
  warehouseId: z.number().int().positive().optional(),
});
