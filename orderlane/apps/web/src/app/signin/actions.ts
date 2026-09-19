"use server";

import { safeRedirectPath } from "@orderlane/core/redirect";
import {
  SESSION_COOKIE,
  ServiceError,
  requestSignInCode,
  signInWithEmailCode,
  signInWithPassword,
  signUpWithPassword,
  revokeSession,
  type IssuedSession,
} from "@orderlane/services";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { sessionMeta } from "@/lib/session";

export interface AuthFormState {
  readonly error?: string;
  readonly notice?: string;
  /** Kept so the code step knows which address it is confirming. */
  readonly email?: string;
  readonly step?: "code";
}

/**
 * Cookie settings, in one place.
 *
 * httpOnly so a cross-site script cannot read the token — the single most
 * valuable property here. sameSite "lax" so the cookie survives a link from an
 * email but not a cross-site form post. secure everywhere except local HTTP,
 * where it would simply never be set and nothing would work.
 */
async function setSessionCookie(session: IssuedSession) {
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });
}

/** Service errors already carry a message written for a person. */
function messageFor(error: unknown): string {
  if (error instanceof ServiceError) return error.message;
  return "Something went wrong. Try again.";
}

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(formData.get("next"));

  try {
    await setSessionCookie(await signInWithPassword({ email, password }, await sessionMeta()));
  } catch (error) {
    return { error: messageFor(error), email };
  }
  redirect(next);
}

export async function signUpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const next = safeRedirectPath(formData.get("next"));

  try {
    await setSessionCookie(
      await signUpWithPassword({ email, password, name: name || undefined }, await sessionMeta()),
    );
  } catch (error) {
    return { error: messageFor(error), email };
  }
  redirect(next);
}

export async function requestCodeAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  try {
    await requestSignInCode(email);
  } catch (error) {
    return { error: messageFor(error), email };
  }
  // The same words whether or not the address exists. This page must not be a
  // way to find out who has an account here.
  return {
    step: "code",
    email,
    notice: "If that address has an account, a six-digit code is on its way. It expires in 10 minutes.",
  };
}

export async function signInWithCodeAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");
  const next = safeRedirectPath(formData.get("next"));

  try {
    await setSessionCookie(await signInWithEmailCode(email, code, await sessionMeta()));
  } catch (error) {
    return { error: messageFor(error), email, step: "code" };
  }
  redirect(next);
}

export async function signOutAction(): Promise<never> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/signin");
}
