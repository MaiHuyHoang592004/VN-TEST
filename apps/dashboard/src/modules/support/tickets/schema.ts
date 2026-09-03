/**
 * What a ticket accepts, and the reason dictionary behind it.
 *
 * Imported by BOTH the form and the action, so a field cannot be editable in
 * the UI yet dropped on save.
 */
import { z } from "zod";

/**
 * The six reasons legacy shipped — as stable KEYS, not the Vietnamese strings
 * it hardcoded in its metadata table (metadata.ts:147-179). The label is looked
 * up per locale at render time, so the same ticket reads correctly for a
 * Vietnamese seller and an English supporter, and a stored ticket never carries
 * prose in a language its reader doesn't speak.
 */
export const TICKET_REASONS = [
  "wrong-item",
  "quality-return",
  "bad-label",
  "wrong-address",
  "missing-item",
  "other",
] as const;

export type TicketReason = (typeof TICKET_REASONS)[number];

/**
 * The priority each reason SUGGESTS. Legacy auto-filled the field and disabled
 * it; ours pre-fills it and leaves it editable — the server takes whatever was
 * submitted, because a supporter who says "this one is urgent" is more informed
 * than a lookup table. Kept in one place so the form and the docs cannot drift.
 */
export const REASON_PRIORITY: Record<TicketReason, "LOW" | "MEDIUM" | "HIGH" | "URGENT"> = {
  "wrong-item": "HIGH",
  "quality-return": "URGENT",
  "bad-label": "LOW",
  "wrong-address": "URGENT",
  "missing-item": "LOW",
  other: "MEDIUM",
};

export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const createTicketSchema = z.object({
  title: z.string().trim().min(3, "Give the ticket a title").max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  reason: z.enum(TICKET_REASONS),
  /** Optional: a ticket can be about the account rather than one parcel. */
  orderId: z.number().int().positive().optional(),
  priority: z.enum(TICKET_PRIORITIES).default("MEDIUM"),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  reason: z.enum(TICKET_REASONS).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});

export const replyTicketSchema = z.object({
  content: z.string().trim().min(1, "Write a message").max(5000),
});

export const setStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const ticketListSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  reason: z.enum(TICKET_REASONS).optional(),
  authorId: z.string().trim().optional(),
  orderId: z.number().int().positive().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});
export type TicketListQuery = z.infer<typeof ticketListSchema>;
