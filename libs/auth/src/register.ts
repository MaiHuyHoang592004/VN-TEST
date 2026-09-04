/**
 * Signup: create (or complete) an email+password account. The caller then
 * sends an OTP via signIn("resend") — verifying the code stamps
 * emailVerified and signs the user in.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@gwprint/db";

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: "invalid-email" | "weak-password" | "exists" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Set a new password for an already-authenticated user (forgot-password
 * flow: identity was proven via email OTP sign-in first). */
export async function changePasswordForUser(
  userId: string,
  password: string,
): Promise<RegisterResult> {
  if (password.length < 8) return { ok: false, error: "weak-password" };
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

export type ChangeOwnPasswordResult =
  | { ok: true }
  | { ok: false; error: "weak-password" | "no-password-set" | "wrong-password" };

/** Change your own password, proving you know the current one. For users with
 * no passwordHash (OAuth-only), the caller should offer "set a password"
 * instead — reported as `no-password-set`. */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangeOwnPasswordResult> {
  if (newPassword.length < 8) return { ok: false, error: "weak-password" };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) return { ok: false, error: "no-password-set" };
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false, error: "wrong-password" };
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

export async function registerUser(input: {
  name?: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;

  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid-email" };
  if (input.password.length < 8) return { ok: false, error: "weak-password" };

  const existing = await prisma.user.findUnique({ where: { email } });
  // Only a VERIFIED account blocks signup. An abandoned signup (column exists
  // but email never verified — e.g. the code never arrived) can always retry;
  // overwriting its password is safe because nothing works until the new
  // registrant proves inbox ownership via the OTP.
  if (existing?.emailVerified) {
    return { ok: false, error: "exists" };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, name: name ?? existing.name },
    });
  } else {
    await prisma.user.create({ data: { email, name, passwordHash } });
  }
  return { ok: true };
}
