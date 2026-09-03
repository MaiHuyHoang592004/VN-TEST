/**
 * Shared validation primitives. Imported by BOTH the server action and the
 * form, so a field can't be editable in the UI yet silently dropped on save
 * (a real legacy bug). Parsing happens on the SERVER inside every action —
 * client-side validation is UX, the server parse is the boundary.
 */
import { z } from "zod";

/** The 7 shipped locales (apps/dashboard/src/lib/i18n). */
export const LOCALES = ["en", "zh", "vi", "ja", "ko", "fr", "ar"] as const;

/** Loose E.164-ish phone: optional +, 7–15 digits. Carrier validation is not
 * our job; catching obvious garbage is. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number")
  .optional()
  .or(z.literal(""));

export const emailSchema = z.string().trim().toLowerCase().email();

/** A positive money amount with at most 2 decimals, kept as a STRING end to
 * end so Decimal precision is never lost through a JS float. */
export const moneyAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 12.50")
  .refine((v) => Number(v) > 0, "Amount must be greater than zero");

export const reasonSchema = z.string().trim().min(3, "A reason is required").max(500);
