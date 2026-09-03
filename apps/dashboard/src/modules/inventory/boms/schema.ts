import { z } from "zod";

export const BOM_STAGES = ["PRODUCTION", "PACKING", "SHIPPING", "OTHER"] as const;
export const BOM_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"] as const;

export const bomLineSchema = z.object({
  /**
   * Null is a FIRST-CLASS state, not a broken column: an UNMAPPED line. The
   * cutover produces them where a legacy component could not be resolved, the
   * Configs page counts them as "incomplete", and reservation refuses to run
   * until they are fixed. Inventing a material to satisfy a foreign key would
   * hide the problem behind data nobody entered.
   */
  materialId: z.number().int().positive().nullish(),
  /** Kept even when mapped, so an unmapped line still says what it wanted. */
  componentSku: z.string().trim().min(1, "SKU is required").max(64),
  componentName: z.string().trim().max(200).optional().or(z.literal("")),
  quantityPerUnit: z.number().positive("Quantity must be greater than zero"),
  unit: z.string().trim().min(1).max(24).default("pcs"),
  /** Stored as a RATE (0.05), shown as a percent (5%). The UI divides. */
  wastageRate: z.number().min(0).max(1).default(0),
  stage: z.enum(BOM_STAGES).default("PRODUCTION"),
  required: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const bomSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  /** Blank means "next available" — the server assigns it under a unique key
   * rather than the form guessing and colliding with a concurrent save. */
  version: z.number().int().positive().optional(),
  status: z.enum(BOM_STATUSES).default("DRAFT"),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  lines: z.array(bomLineSchema),
});
export type BomInput = z.infer<typeof bomSchema>;

export const previewSchema = z
  .object({
    bomId: z.number().int().positive().optional(),
    productVariantId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().default(1),
    warehouseId: z.number().int().positive().optional(),
  })
  .refine((p) => Boolean(p.bomId) || Boolean(p.productVariantId), {
    message: "Name a BOM or a product to preview",
  });
