import { z } from "zod";

import { moneyAmountSchema } from "../../core/schema.ts";

export const EXPENSE_TYPES = ["EXPENSE", "INCOME"] as const;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  type: z.enum(EXPENSE_TYPES).default("EXPENSE"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const entrySchema = z.object({
  categoryId: z.number().int().positive("Pick a category"),
  /** Defaults from the category, but editable: a supplier refund is income
   * filed under an expense bucket, and moving it would lose the grouping. */
  type: z.enum(EXPENSE_TYPES).default("EXPENSE"),
  /** String end to end, like every other money field (core/schema). Always
   * positive — `type` carries the direction. */
  amount: moneyAmountSchema,
  /** ISO date from the form. When the money MOVED, not when it was typed. */
  occurredAt: z.string().trim().min(1, "Pick a date"),
  vendorId: z.number().int().positive().optional(),
  paymentMethod: z.string().trim().max(60).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});
export type EntryInput = z.infer<typeof entrySchema>;

export const entryListSchema = z.object({
  search: z.string().trim().max(200).optional(),
  type: z.enum(EXPENSE_TYPES).optional(),
  categoryId: z.number().int().positive().optional(),
  vendorId: z.number().int().positive().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});
export type EntryListQuery = z.infer<typeof entryListSchema>;
