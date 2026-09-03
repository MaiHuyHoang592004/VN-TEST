import { z } from "zod";

import { USER_ROLES as SHARED_USER_ROLES } from "@opcreative/shared";

import { moneyAmountSchema, reasonSchema, emailSchema, phoneSchema } from "../../core/schema.ts";

// Roles come from @opcreative/shared, the single source of truth that
// libs/db asserts against Prisma's generated enum at compile time. Statuses
// stay local until something else needs them.
export { USER_ROLES } from "@opcreative/shared";
export const USER_STATUSES = ["ACTIVE", "INACTIVE", "BANNED"] as const;

export const inviteSchema = z.object({
  email: emailSchema,
  roles: z.array(z.enum(SHARED_USER_ROLES)).min(1, "Pick at least one role"),
  warehouseId: z.number().int().positive().nullable().optional(),
  tier: z.number().int().min(1).max(4).nullable().optional(),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const adminUserUpdateSchema = z.object({
  name: z.string().trim().max(120).optional().or(z.literal("")),
  phone: phoneSchema,
  roles: z.array(z.enum(SHARED_USER_ROLES)).min(1, "A user needs at least one role"),
  status: z.enum(USER_STATUSES),
  tier: z.number().int().min(1).max(4).nullable().optional(),
  warehouseId: z.number().int().positive().nullable().optional(),
  adminNote: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

/** Money movement. `idempotencyKey` makes a double-click (or a mobile retry)
 * credit exactly once. `reason` is mandatory and lands in the audit column. */
export const balanceMoveSchema = z.object({
  amount: moneyAmountSchema,
  reason: reasonSchema,
  paymentMethod: z.string().trim().max(40).optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});
export type BalanceMoveInput = z.infer<typeof balanceMoveSchema>;
