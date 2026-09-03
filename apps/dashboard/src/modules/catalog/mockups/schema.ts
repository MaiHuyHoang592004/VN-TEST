import { z } from "zod";

/**
 * Mockup.status is a String in the schema, not an enum — mockups have only ever
 * been on or off, and a migration to buy two values isn't worth it. This schema
 * is what keeps that row from becoming a free-text junk drawer: it is the
 * only writer, so the two values below are the only ones that reach the table.
 */
export const mockupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  url: z.string().trim().url("Enter a valid URL").max(1000),
  thumbnail: z.string().trim().url("Enter a valid URL").max(1000).optional().or(z.literal("")),
  /// Google Drive folder id in legacy data; free text because the next
  /// storage backend will key differently (doc 03 R3).
  folderId: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type MockupInput = z.infer<typeof mockupSchema>;
