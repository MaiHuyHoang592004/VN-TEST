/**
 * Profile Server Actions — thin adapters over profile/service.ts. Each one:
 * authenticate → build audit context → call the service → revalidate. The
 * logic lives in the service so the mobile /api/v1 routes can reuse it without
 * a rewrite.
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import * as profile from "./service.ts";

export async function updateProfileAction(input: unknown) {
  const actor = await requireUser();
  const ctx = await auditContext(actor);
  const result = await withValidation(() => profile.updateProfile(actor, input, ctx));
  if (result.ok) revalidatePath("/profile");
  return result;
}

/** Language + timezone only — see preferencesSchema for why it's separate. */
export async function updatePreferencesAction(input: unknown) {
  const actor = await requireUser();
  const ctx = await auditContext(actor);
  const result = await withValidation(() => profile.updatePreferences(actor, input, ctx));
  if (result.ok) revalidatePath("/profile");
  return result;
}

export async function changePasswordAction(input: unknown) {
  const actor = await requireUser();
  return profile.changePassword(actor, input, await auditContext(actor));
}

export async function requestEmailChangeAction(input: unknown) {
  const actor = await requireUser();
  return profile.requestEmailChange(actor, input);
}

export async function confirmEmailChangeAction(code: string) {
  const actor = await requireUser();
  const result = await profile.confirmEmailChange(actor, code, await auditContext(actor));
  revalidatePath("/profile");
  return result;
}

export async function updateWebhookAction(input: unknown) {
  const actor = await requireUser();
  const result = await profile.updateWebhook(actor, input, await auditContext(actor));
  revalidatePath("/profile");
  return result;
}

export async function testWebhookAction() {
  const actor = await requireUser();
  return profile.testWebhook(actor);
}

export async function createApiKeyAction(input: unknown) {
  const actor = await requireUser();
  const result = await profile.createApiKey(actor, input, await auditContext(actor));
  revalidatePath("/profile");
  return result;
}

export async function revokeApiKeyAction(keyId: number) {
  const actor = await requireUser();
  const result = await profile.revokeApiKey(actor, keyId, await auditContext(actor));
  revalidatePath("/profile");
  return result;
}

export async function signOutEverywhereAction() {
  const actor = await requireUser();
  return profile.signOutEverywhere(actor);
}
