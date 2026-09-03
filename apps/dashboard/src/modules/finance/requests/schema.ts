/**
 * What a seller may ask for. Imported by the dialogs AND the actions, so a
 * field cannot be editable in the UI yet dropped on save.
 */
import { z } from "zod";

import { moneyAmountSchema, reasonSchema } from "../../core/schema.ts";

/**
 * How the seller says they paid. A free string rather than an enum: legacy
 * stored whatever the form offered, the list differs per market (bank
 * transfer, Payoneer, USDT…), and an enum here would need a migration every
 * time finance adds one. The value is a label on a PENDING column a human reads
 * before approving — it decides nothing.
 */
export const PAYMENT_METHODS = ["bank-transfer", "card", "paypal", "crypto", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const topUpRequestSchema = z.object({
  /** String end to end so Decimal precision survives the wire (core/schema). */
  amount: moneyAmountSchema,
  method: z.enum(PAYMENT_METHODS),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type TopUpRequestInput = z.infer<typeof topUpRequestSchema>;

export const refundRequestSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1, "Pick at least one order"),
  /** REQUIRED, unlike the top-up note: an approver deciding to move money back
   * needs to know what went wrong, and legacy's blank refunds were unauditable. */
  reason: reasonSchema,
  /** Optional: defaults to the full quote and is capped there by the service. */
  amount: moneyAmountSchema.optional(),
});
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;
