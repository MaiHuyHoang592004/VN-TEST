import { z } from "zod";

/**
 * A stable machine key: lives in URLs, in the public API, and in the spreadsheet
 * import, where sellers type it by hand. Lowercase-only so "Leather-Wallet" and
 * "leather-wallet" can never become two products.
 *
 * Shared by products and variants — the legacy import matched BOTH by key, so
 * the two must accept exactly the same shape or a valid column becomes unmatchable.
 */
export const catalogKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,64}$/, "2–64 lowercase letters, digits or dashes");

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  key: catalogKeySchema,
  thumbnail: z.string().trim().url("Enter a valid URL").max(500).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).default("DRAFT"),
  // ponytail: Product.configs is deliberately not editable here. It is an
  // escape hatch the legacy cutover fills, and no screen reads it yet; giving
  // it a UI means building a JSON editor nobody asked for. Add a typed field
  // when a real setting needs one.
});

export type ProductInput = z.infer<typeof productSchema>;
