import { z } from "zod";

import { catalogKeySchema } from "../products/schema.ts";

/**
 * A product is a shared axis value ("Brown", "Large"), NOT variant-specific —
 * the sellable SKU is Product × Variant (see variant-variants/). So there is no
 * variant field here on purpose.
 */
export const variantSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  key: catalogKeySchema,
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

export type VariantInput = z.infer<typeof variantSchema>;
