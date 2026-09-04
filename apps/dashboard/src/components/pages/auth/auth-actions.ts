"use server";

import {
  auth,
  registerUser,
  changePasswordForUser,
  type RegisterResult,
} from "@gwprint/auth";

export async function register(input: {
  name?: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  return registerUser(input);
}

/** Forgot-password: caller is already signed in (via email OTP), so the
 * session IS the proof of identity. */
export async function changePassword(input: {
  password: string;
}): Promise<RegisterResult | { ok: false; error: "unauthorized" }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  return changePasswordForUser(session.user.id, input.password);
}
