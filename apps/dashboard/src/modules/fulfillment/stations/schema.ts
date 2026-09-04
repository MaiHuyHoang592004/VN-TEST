import { z } from "zod";

/**
 * What the scan stations accept. The UI imports these too, so the barcode
 * input and the raw API caller are held to the SAME rules — legacy truncated
 * to 22 characters in the browser only, which meant an integration posting the
 * untruncated string silently matched nothing.
 */

/** Carriers print more than the tracking number in one barcode; the number is
 * the LAST 22 characters (legacy's constant, verified on the floor). */
export const TRACKING_LENGTH = 22;

export const truncateTracking = (value: string): string =>
  value.trim().length > TRACKING_LENGTH ? value.trim().slice(-TRACKING_LENGTH) : value.trim();

/**
 * One scan. `mode` decides how `value` is read, so the two searches cannot be
 * confused: a tracking number is a string to match, an order id is a column.
 *
 * The 10-character floor applies to tracking only — legacy used 11 on one
 * station and 10 on another, and standardising on the looser of the two costs
 * nothing but rejects the stray keystroke. Order ids are short by nature.
 */
export const scanSchema = z
  .object({
    mode: z.enum(["tracking", "order"]),
    value: z.string().trim().min(1, "Scan or type a code").max(60),
    /** The client re-sends this after the operator accepts the >20 gate. */
    confirmed: z.boolean().optional(),
  })
  .refine((v) => v.mode !== "tracking" || v.value.length >= 10, {
    path: ["value"],
    message: "A tracking number is at least 10 characters",
  })
  .refine((v) => v.mode !== "order" || /^\d+$/.test(v.value), {
    path: ["value"],
    message: "An order id is a number",
  });

export type ScanInput = z.infer<typeof scanSchema>;

export const fillSchema = z.object({
  orderId: z.number().int().positive(),
  amount: z.number().int().min(1, "Fill at least one"),
});

/** Either identifier resolves to the same group — the station has a tracking
 * number, the /orders column action has an order id. */
const groupRef = z
  .object({
    trackingNumber: z.string().trim().min(1).max(60).optional(),
    orderId: z.number().int().positive().optional(),
  })
  .refine((v) => Boolean(v.trackingNumber) || Boolean(v.orderId), {
    message: "Name a tracking number or an order",
  });

export const attachProofSchema = groupRef;

/**
 * The handoff names the parcel AND the number it ships under, which are not
 * always the same lookup: a parcel worked without a label has no shipment to
 * find by tracking number, so the station identifies it by an order id and
 * supplies the tracking number that is going on the box. Requiring only a
 * tracking number would make exactly that parcel unshippable — and it is the
 * one the "create the missing shipment" rule exists for.
 */
export const handoffSchema = z
  .object({
    trackingNumber: z.string().trim().min(1).max(60).optional(),
    orderId: z.number().int().positive().optional(),
    /** Typed by a human, on purpose. See completeHandoff. */
    confirmText: z.string(),
  })
  .refine((v) => Boolean(v.trackingNumber) || Boolean(v.orderId), {
    path: ["trackingNumber"],
    message: "Name a tracking number or an order",
  });

export const linkLabelSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1, "Select at least one order"),
  trackingNumber: z.string().trim().min(10, "A tracking number is at least 10 characters").max(60),
  labelUrl: z.string().trim().url("Enter a valid URL").max(1000),
  provider: z.string().trim().max(64).optional(),
  method: z.string().trim().max(64).optional(),
  /** A string end to end, like every other money field — a JS float cannot
   * hold 12.10 exactly and a label cost ends up on an invoice. */
  cost: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 4.50")
    .optional(),
});

export const quickUpdateSchema = z.object({
  keyword: z.string().trim().min(10, "A tracking number is at least 10 characters").max(60),
  to: z.enum([
    "PENDING",
    "ASSIGNED",
    "IN_PRODUCTION",
    "FULFILLED",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "ON_HOLD",
  ]),
  note: z.string().trim().max(2000).optional(),
});
