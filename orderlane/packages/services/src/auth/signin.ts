import { isEmailShaped, normalizeEmail, validatePassword } from "@orderlane/core/auth";
import { systemPrisma } from "@orderlane/db";

import { ConflictError, ForbiddenError, ValidationError } from "../errors.ts";
import { consumeEmailCode, issueEmailCode, type IssuedCode } from "./codes.ts";
import { decoyHash, hashPassword, verifyPassword } from "./passwords.ts";
import { createSession, revokeAllSessions, type IssuedSession, type SessionMeta } from "./sessions.ts";
import { checkThrottle, clearThrottle, recordFailure } from "./throttle.ts";

/**
 * The sign-in flows.
 *
 * Two methods, both ending in the same place: a session row and an opaque
 * token. A third (federated identity) attaches to `AuthAccount` and changes
 * nothing below that line.
 *
 * One rule runs through all of it: **a failure never says which part failed.**
 * "No such account" and "wrong password" are the same answer, take the same
 * time, and look the same on the wire. Anything else turns sign-in into a
 * service for discovering who has an account here.
 */

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface SignUpInput extends Credentials {
  readonly name?: string | undefined;
}

export async function signUpWithPassword(input: SignUpInput, meta: SessionMeta = {}): Promise<IssuedSession> {
  const email = normalizeEmail(input.email);
  if (!isEmailShaped(email)) throw new ValidationError("that does not look like an email address");

  const issues = validatePassword(input.password, email);
  if (issues.length > 0) throw new ValidationError("that password will not do", issues);

  const passwordHash = await hashPassword(input.password);

  try {
    const user = await systemPrisma.user.create({
      data: {
        email,
        passwordHash,
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      },
    });
    // The address is not verified yet, and sign-in does not wait for it. A new
    // account has no data to protect, and blocking on a delayed email is a
    // reliable way to lose the person before they see the product.
    await issueEmailCode(email, "VERIFY_EMAIL");
    return createSession(user.id, meta);
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      // Deliberately explicit. Sign-UP cannot hide that an address is taken —
      // the person has to be told to sign in instead — so the protection for
      // enumeration belongs on sign-IN, where it is possible.
      throw new ConflictError("an account already exists for that address");
    }
    throw error;
  }
}

function throttleKey(email: string, meta: SessionMeta): string {
  // Keyed on both, so one attacker cannot lock a real person out by guessing
  // at their address from somewhere else.
  return `${email}|${meta.ip ?? "unknown"}`;
}

export async function signInWithPassword(input: Credentials, meta: SessionMeta = {}): Promise<IssuedSession> {
  const email = normalizeEmail(input.email);
  const key = throttleKey(email, meta);

  const verdict = checkThrottle(key);
  if (!verdict.allowed) {
    throw new ForbiddenError("too many attempts; wait a few minutes and try again", {
      retryAfterMs: verdict.retryAfterMs,
    });
  }

  const user = await systemPrisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  // Verify even when there is no user, against a hash of a password nobody
  // has. Skipping the work here is what makes sign-in a timing oracle for
  // which addresses are registered.
  const hash = user?.passwordHash ?? (await decoyHash());
  const ok = await verifyPassword(input.password, hash);

  if (!user || !ok) {
    recordFailure(key);
    throw new ValidationError("that email and password do not match an account");
  }

  clearThrottle(key);
  return createSession(user.id, meta);
}

/** Step one of passwordless sign-in. */
export async function requestSignInCode(rawEmail: string): Promise<IssuedCode> {
  const email = normalizeEmail(rawEmail);
  if (!isEmailShaped(email)) throw new ValidationError("that does not look like an email address");

  const user = await systemPrisma.user.findUnique({ where: { email }, select: { id: true } });

  // A code is only issued for an address that exists, but the CALLER is told
  // the same thing either way — "if that address has an account, a code is on
  // its way". The caller is what an attacker sees.
  if (user) await issueEmailCode(email, "SIGN_IN");

  return { expiresAt: new Date(Date.now() + 10 * 60_000) };
}

export async function signInWithEmailCode(rawEmail: string, code: string, meta: SessionMeta = {}): Promise<IssuedSession> {
  const email = normalizeEmail(rawEmail);
  const key = throttleKey(email, meta);

  const verdict = checkThrottle(key);
  if (!verdict.allowed) {
    throw new ForbiddenError("too many attempts; wait a few minutes and try again", {
      retryAfterMs: verdict.retryAfterMs,
    });
  }

  const outcome = await consumeEmailCode(email, code, "SIGN_IN");
  if (outcome !== "ok") {
    recordFailure(key);
    throw new ValidationError(
      outcome === "expired" ? "that code has expired; ask for a new one" : "that code is not right",
    );
  }

  const user = await systemPrisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    // Only reachable if the account went away between the code being issued
    // and used. Consuming it first is deliberate: a code must not survive a
    // failed use.
    recordFailure(key);
    throw new ValidationError("that code is not right");
  }

  clearThrottle(key);
  // Proving control of the address is proof enough to mark it verified.
  await systemPrisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  return createSession(user.id, meta);
}

export async function verifyEmailWithCode(rawEmail: string, code: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const outcome = await consumeEmailCode(email, code, "VERIFY_EMAIL");
  if (outcome !== "ok") throw new ValidationError("that code is not right");
  await systemPrisma.user.updateMany({ where: { email }, data: { emailVerifiedAt: new Date() } });
}

/**
 * Change a password, and end every other session.
 *
 * A password change that leaves the old sessions live has not locked anybody
 * out — which is the entire reason most people change one.
 */
export async function changePassword(
  userId: string,
  current: string,
  next: string,
  keepSessionId?: string,
): Promise<void> {
  const user = await systemPrisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) throw new ValidationError("no such account");

  if (!(await verifyPassword(current, user.passwordHash))) {
    throw new ValidationError("your current password is not right");
  }

  const issues = validatePassword(next, user.email);
  if (issues.length > 0) throw new ValidationError("that password will not do", issues);

  await systemPrisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await revokeAllSessions(userId, keepSessionId);
}
