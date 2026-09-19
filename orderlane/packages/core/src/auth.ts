/**
 * The parts of authentication that are decisions rather than cryptography.
 *
 * Hashing lives in @orderlane/services, where node:crypto is available and a
 * database is nearby. What is here is pure, so the rules can be tested
 * exhaustively and cannot differ between the sign-up form, the API and a
 * future password-reset flow.
 */

/**
 * One spelling of an address, everywhere.
 *
 * Case-folded because mail servers treat the domain case-insensitively and
 * essentially every provider treats the local part that way too; trimmed
 * because a pasted address usually brings a space. NOT stripped of dots or
 * `+tags`: those are Gmail conventions, not email ones, and "normalising" them
 * would merge two addresses that a different provider considers distinct.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * Deliberately loose. The only reliable test of an address is sending to it,
 * and a stricter pattern's entire effect is rejecting the valid addresses that
 * happen to look unusual.
 */
export function isEmailShaped(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length <= 320 && EMAIL.test(email);
}

export type PasswordIssueCode = "too_short" | "too_long" | "too_common" | "contains_email";

export interface PasswordIssue {
  readonly code: PasswordIssueCode;
  readonly message: string;
}

export const MIN_PASSWORD_LENGTH = 10;
/** Hashing a megabyte of "password" is a free denial of service, so cap it. */
export const MAX_PASSWORD_LENGTH = 200;

/**
 * A small blocklist of the passwords people actually pick.
 *
 * A real deployment checks a breach corpus; the list matters less than the
 * shape of the rule. Note what is NOT here: "must contain a digit and a
 * symbol". Composition rules push people towards `Password1!` and are
 * explicitly discouraged by NIST SP 800-63B, which asks for length and a
 * blocklist instead. Following the evidence is worth more than looking strict.
 */
const COMMON = new Set([
  "password", "password1", "password123", "qwertyuiop", "1234567890",
  "letmein123", "iloveyou1", "admin12345", "welcome123", "changeme123",
  "administrator", "passw0rd123", "abc123456789", "qwerty123456",
]);

export function validatePassword(password: string, email?: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push({ code: "too_short", message: `use at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    issues.push({ code: "too_long", message: `use at most ${MAX_PASSWORD_LENGTH} characters` });
  }
  if (COMMON.has(password.toLowerCase())) {
    issues.push({ code: "too_common", message: "this is one of the most guessed passwords there is" });
  }
  if (email) {
    const local = normalizeEmail(email).split("@")[0] ?? "";
    if (local.length >= 3 && password.toLowerCase().includes(local)) {
      issues.push({ code: "contains_email", message: "do not put your email address in your password" });
    }
  }

  return issues;
}

/** Six digits, as a string, because leading zeros are part of the code. */
export const EMAIL_CODE_LENGTH = 6;
/** Short enough to limit the guessing window, long enough to read an email. */
export const EMAIL_CODE_TTL_MINUTES = 10;
/** A six-digit code is only safe with a hard ceiling on tries. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export function isEmailCodeShaped(code: string): boolean {
  return new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`).test(code.trim());
}

export const SESSION_TTL_DAYS = 30;
/**
 * How stale `lastSeenAt` may get before it is worth a write.
 *
 * Updating it on every request would turn a read-only page load into a write,
 * on every request, for a field nothing urgent depends on.
 */
export const SESSION_TOUCH_INTERVAL_MINUTES = 15;

/**
 * The session cookie's name.
 *
 * It lives in this package, which has no dependencies, because Edge middleware
 * needs it and must not import anything that reaches a database driver. That
 * is not a detail: importing it from the service layer pulled the Prisma
 * client — and `node:path` with it — into the Edge bundle, and the build
 * failed with a stack trace that named webpack rather than the mistake.
 */
export const SESSION_COOKIE = "orderlane_session";
