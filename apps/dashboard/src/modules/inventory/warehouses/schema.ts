import { z } from "zod";

export const warehouseSchema = z.object({
  // Master-data code: uppercased in the service, letters/digits/dash/underscore.
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,16}$/, "2–16 letters, digits, - or _"),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  region: z.string().trim().max(64).optional().or(z.literal("")),
  line1: z.string().trim().max(200).optional().or(z.literal("")),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  state: z.string().trim().max(120).optional().or(z.literal("")),
  zip: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(120).optional().or(z.literal("")),
  timezone: z.string().trim().min(1).max(64).default("Asia/Ho_Chi_Minh"),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  contactEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;
