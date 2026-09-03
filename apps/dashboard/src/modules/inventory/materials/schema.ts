import { z } from "zod";

export const MATERIAL_TYPES = [
  "RAW_MATERIAL",
  "PACKAGING",
  "SEMI_FINISHED",
  "CONSUMABLE",
  "OTHER",
] as const;

export const materialSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(64),
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(MATERIAL_TYPES).default("RAW_MATERIAL"),
  // Free text, not an enum: the floor types real units ("m", "roll", "kg"),
  // and legacy never constrained it. Defaulted rather than required so the
  // common case (pieces) is one less field to fill in.
  uom: z.string().trim().min(1).max(24).default("pcs"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  trackInventory: z.boolean().default(true),
});
export type MaterialInput = z.infer<typeof materialSchema>;
