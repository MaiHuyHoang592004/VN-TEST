import { z } from "zod";

export const ITEM_TYPES = ["MATERIAL", "PRODUCT"] as const;

/** Which shelf a stock operation is about. One id row, one discriminator —
 * the whole reason suppliers and finished goods share this module. */
export const itemRefSchema = z.object({
  itemType: z.enum(ITEM_TYPES),
  itemId: z.number().int().positive(),
});

export const adjustStockSchema = itemRefSchema.extend({
  warehouseId: z.number().int().positive(),
  /**
   * ONE SIGNED NUMBER, no +/- toggle: the sign IS the direction, which is the
   * UX contract the floor already knows from the legacy modal. Refusing zero
   * on purpose — an adjustment that changes nothing is a mis-click, and
   * writing a movement column for it makes the ledger harder to read.
   */
  quantityDelta: z.number().int().refine((n) => n !== 0, "Enter a non-zero amount"),
  /** Required. An unexplained count change is the one thing an audit cannot
   * reconstruct later, so the field is not optional and not defaulted. */
  reason: z.string().trim().min(1, "Reason is required").max(200),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const quickImportSchema = itemRefSchema.extend({
  warehouseId: z.number().int().positive(),
  quantity: z.number().int().positive("Enter at least 1"),
  /** Legacy required a note on every manual change (import-stock.dto.ts:4-13)
   * and it is the only trace of WHY stock appeared outside a receipt. Kept. */
  note: z.string().trim().min(1, "Note is required").max(500),
  provider: z.string().trim().max(120).optional().or(z.literal("")),
});
export type QuickImportInput = z.infer<typeof quickImportSchema>;
