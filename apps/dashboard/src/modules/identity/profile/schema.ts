import { z } from "zod";

import { LOCALES, emailSchema, phoneSchema } from "../../core/schema.ts";

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: phoneSchema,
  locale: z.enum(LOCALES),
  timezone: z.string().trim().min(1).max(64),
  companyName: z.string().trim().max(200).optional().or(z.literal("")),
  taxId: z.string().trim().max(64).optional().or(z.literal("")),
  avatarUrl: z.string().url().max(2048).optional().or(z.literal("")),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** Language + timezone only. Deliberately separate from profileUpdateSchema:
 * the Preferences card must save even when the display name is still blank —
 * failing on another card's required field is a dead end for the user. */
export const preferencesSchema = z.object({
  locale: z.enum(LOCALES),
  timezone: z.string().trim().min(1).max(64),
});

export const emailChangeSchema = z.object({ email: emailSchema });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Use at least 8 characters").max(200),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  });

export const webhookSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => u.startsWith("https://"), "Webhook URL must use https")
    .max(2048)
    .optional()
    .or(z.literal("")),
  secret: z.string().trim().min(16, "Secret must be at least 16 characters").max(200).optional().or(z.literal("")),
});

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1, "Name the key so you can tell them apart").max(80),
});
