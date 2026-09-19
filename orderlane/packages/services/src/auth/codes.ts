import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import {
  EMAIL_CODE_LENGTH,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_MINUTES,
  isEmailCodeShaped,
  normalizeEmail,
} from "@orderlane/core/auth";
import type { EmailCodePurpose } from "@orderlane/db";
import { systemPrisma } from "@orderlane/db";

import { mailer } from "./mailer.ts";

/**
 * One-time email codes.
 *
 * `randomInt` rather than `Math.random()`: the code is a credential, and a
 * predictable one is not a credential. Only the hash is stored, so a database
 * leak still leaves an attacker guessing inside a ten-minute window against a
 * five-try ceiling.
 */

function hashCode(email: string, code: string): string {
  // The address is part of the input, so a code issued for one address cannot
  // be replayed against another even if both happen to be the same six digits.
  return createHash("sha256").update(`${normalizeEmail(email)}:${code}`, "utf8").digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 10 ** EMAIL_CODE_LENGTH)).padStart(EMAIL_CODE_LENGTH, "0");
}

export interface IssuedCode {
  readonly expiresAt: Date;
  /** Returned only when AUTH_CODE_ECHO is set, for local development. */
  readonly devCode?: string;
}

export async function issueEmailCode(rawEmail: string, purpose: EmailCodePurpose): Promise<IssuedCode> {
  const email = normalizeEmail(rawEmail);
  const code = generateCode();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60_000);

  // Asking for a new code invalidates the old one. Two live codes doubles the
  // guessing surface for no benefit, and a person who asked twice is going to
  // use the newer email.
  await systemPrisma.$transaction(async (tx) => {
    await tx.emailCode.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.emailCode.create({ data: { email, purpose, codeHash: hashCode(email, code), expiresAt } });
  });

  await mailer().send({
    to: email,
    subject: `${code} is your Orderlane sign-in code`,
    text: `Your code is ${code}. It expires in ${EMAIL_CODE_TTL_MINUTES} minutes.\n\nIf you did not ask for it, you can ignore this email.`,
  });

  return process.env["AUTH_CODE_ECHO"] === "1" ? { expiresAt, devCode: code } : { expiresAt };
}

export type CodeVerdict = "ok" | "invalid" | "expired" | "too_many_attempts";

/**
 * Check a code and consume it.
 *
 * Consuming on success is what makes it one-time: without it, a code read from
 * an inbox stays usable for its whole lifetime, including by whoever else can
 * read that inbox.
 */
export async function consumeEmailCode(rawEmail: string, rawCode: string, purpose: EmailCodePurpose): Promise<CodeVerdict> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  if (!isEmailCodeShaped(code)) return "invalid";

  const record = await systemPrisma.emailCode.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return "invalid";
  if (record.expiresAt <= new Date()) return "expired";
  if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return "too_many_attempts";

  const expected = Buffer.from(record.codeHash, "hex");
  const actual = Buffer.from(hashCode(email, code), "hex");
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    const bumped = await systemPrisma.emailCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    // Burn the code once the ceiling is reached rather than leaving it to
    // expire: an attacker who has used their tries gets nothing more from it.
    if (bumped.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      await systemPrisma.emailCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
      return "too_many_attempts";
    }
    return "invalid";
  }

  // Conditional on consumedAt so two simultaneous submissions of the same code
  // cannot both succeed.
  const consumed = await systemPrisma.emailCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1 ? "ok" : "invalid";
}

export async function purgeExpiredCodes(before = new Date()): Promise<number> {
  const result = await systemPrisma.emailCode.deleteMany({ where: { expiresAt: { lt: before } } });
  return result.count;
}
