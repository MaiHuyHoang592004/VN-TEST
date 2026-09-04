/**
 * Admin user-management Server Actions. Each starts with requirePermission —
 * the guard is the security boundary; the service enforces ownership and the
 * money rules. Roles.manage / balance.manage are checked as their own
 * permissions, not folded into users.update.
 */
"use server";

import { revalidatePath } from "next/cache";

import type { UserStatus } from "@gwprint/db";

import { requirePermission, requireUser } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import * as users from "./service.ts";

export async function inviteUserAction(input: unknown) {
  const actor = await requirePermission("users.create");
  const result = await users.inviteUser(actor, input, await auditContext(actor));
  revalidatePath("/admin/users");
  return result;
}

export async function revokeInviteAction(inviteId: string) {
  const actor = await requirePermission("users.create");
  const result = await users.revokeInvite(actor, inviteId, await auditContext(actor));
  revalidatePath("/admin/users");
  return result;
}

export async function updateUserAction(id: string, input: unknown) {
  const actor = await requirePermission("users.update");
  const result = await users.updateUser(actor, id, input, await auditContext(actor));
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return result;
}

export async function setUserStatusAction(id: string, status: UserStatus) {
  const actor = await requirePermission("users.update");
  const result = await users.setUserStatus(actor, id, status, await auditContext(actor));
  revalidatePath("/admin/users");
  return result;
}

export async function deleteUserAction(id: string) {
  const actor = await requirePermission("users.delete");
  const result = await users.deleteUser(actor, id, await auditContext(actor));
  revalidatePath("/admin/users");
  return result;
}

export async function topUpBalanceAction(userId: string, input: unknown) {
  const actor = await requirePermission("users.balance.manage");
  const result = await users.topUpBalance(actor, userId, input, await auditContext(actor));
  revalidatePath(`/admin/users/${userId}`);
  return result;
}

export async function refundBalanceAction(userId: string, input: unknown) {
  const actor = await requirePermission("users.balance.manage");
  const result = await users.refundBalance(actor, userId, input, await auditContext(actor));
  revalidatePath(`/admin/users/${userId}`);
  return result;
}

export async function adjustBalanceAction(
  userId: string,
  direction: "credit" | "debit",
  input: unknown,
) {
  const actor = await requirePermission("users.balance.manage");
  const result = await users.adjustBalance(actor, userId, direction, input, await auditContext(actor));
  revalidatePath(`/admin/users/${userId}`);
  return result;
}

/** Accept an invitation for the signed-in account. Only requires a session —
 * the invite token itself is the authorisation, and the service verifies the
 * email matches. */
export async function acceptInviteAction(token: string) {
  const actor = await requireUser();
  return users.acceptInvite(actor, token, await auditContext(actor));
}
