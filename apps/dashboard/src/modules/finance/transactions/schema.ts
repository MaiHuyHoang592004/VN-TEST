import { z } from "zod";

import { reasonSchema } from "../../core/schema.ts";

/**
 * A rejection must say why. Not politeness — the seller sees this text, and
 * "rejected" with no reason generates a support ticket every single time.
 */
export const rejectTransactionSchema = z.object({ reason: reasonSchema });

export const transactionListSchema = z.object({
  userId: z.string().trim().optional(),
  type: z.enum(["TOPUP", "ORDER_PAYMENT", "REFUND", "ADJUSTMENT"]).optional(),
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  search: z.string().trim().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type TransactionListQuery = z.infer<typeof transactionListSchema>;
