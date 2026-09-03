import { z } from "zod";

/**
 * A supplier. The model landed with doc 06's receipts (a shipment needs
 * someone to have sent it); this is the page that maintains it.
 */
export const vendorSchema = z.object({
  /** Optional: the service generates VND-1, VND-2… when it is left blank, the
   * behaviour legacy's form had. Uppercased on save. */
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,24}$/, "2–24 letters, digits, - or _")
    .optional()
    .or(z.literal("")),
  name: z.string().trim().min(1, "Name is required").max(160),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  taxCode: z.string().trim().max(40).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export type VendorInput = z.infer<typeof vendorSchema>;

export const vendorListSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});
export type VendorListQuery = z.infer<typeof vendorListSchema>;
