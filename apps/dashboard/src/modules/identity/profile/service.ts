/**
 * Profile self-service logic. Transport-agnostic: every function takes an
 * explicit `actor` and never reads cookies or headers, so the same code backs
 * the web Server Actions today and the mobile /api/v1 routes later. The action
 * layer is a thin wrapper that supplies the actor from the session.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import {
  prisma,
  writeAudit,
  enforceRateLimit,
  RATE_LIMITS,
  USER_SELF_SELECT,
  API_KEY_SELECT,
  type AuditContext,
} from "@gwprint/db";
import { changeOwnPassword, sendVerificationCode } from "@gwprint/auth";

import {
  profileUpdateSchema,
  preferencesSchema,
  emailChangeSchema,
  passwordChangeSchema,
  webhookSchema,
  apiKeyCreateSchema,
} from "./schema.ts";
import { generateApiKey } from "../api-keys/service.ts";

type Actor = AuditContext["actor"] & object; // non-null SessionUser
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const nullIfBlank = (v: string | undefined) => (v && v.length ? v : null);

export async function getMyProfile(actor: Actor) {
  return prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: USER_SELF_SELECT,
  });
}

export async function updateProfile(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
) {
  const input = profileUpdateSchema.parse(raw);
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { name: true, phone: true, locale: true, timezone: true, companyName: true, taxId: true, avatarUrl: true },
  });
  const data = {
    name: input.name,
    phone: nullIfBlank(input.phone),
    locale: input.locale,
    timezone: input.timezone,
    companyName: nullIfBlank(input.companyName),
    taxId: nullIfBlank(input.taxId),
    avatarUrl: nullIfBlank(input.avatarUrl),
  };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data });
    await writeAudit(tx, ctx, {
      action: "USER_UPDATED",
      targetType: "user",
      targetId: actor.id,
      before,
      after: data,
    });
  });
  return { ok: true as const };
}

export async function updatePreferences(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
) {
  const input = preferencesSchema.parse(raw);
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { locale: true, timezone: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: input });
    await writeAudit(tx, ctx, {
      action: "USER_UPDATED",
      targetType: "user",
      targetId: actor.id,
      before,
      after: input,
    });
  });
  return { ok: true as const };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "weak-password" | "no-password-set" | "wrong-password" };

export async function changePassword(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
): Promise<ChangePasswordResult> {
  const input = passwordChangeSchema.parse(raw);
  // Throttled per user: without it the current-password check is a free
  // oracle for anyone who gets hold of a session.
  await enforceRateLimit(`pwchange:${actor.id}`, RATE_LIMITS.passwordChange);
  const result = await changeOwnPassword(actor.id, input.currentPassword, input.newPassword);
  if (!result.ok) return result;
  // Changing the password revokes every existing session and writes the audit.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { sessionsValidFrom: new Date() },
    });
    await writeAudit(tx, ctx, {
      action: "PASSWORD_CHANGED",
      targetType: "user",
      targetId: actor.id,
    });
  });
  return { ok: true };
}

const EMAIL_CHANGE_TTL_MS = 10 * 60 * 1000;
const emailChangeId = (userId: string) => `email-change:${userId}`;

/** Step 1: park the requested address and send a code to it (not the current
 * inbox). We never touch `email` until the code proves ownership — an
 * unverified swap is an account-takeover primitive. */
export async function requestEmailChange(actor: Actor, raw: unknown) {
  const { email } = emailChangeSchema.parse(raw);
  // Sends mail to an address the user names — same abuse shape as OTP.
  await enforceRateLimit(`emailchange:${actor.id}`, RATE_LIMITS.emailChange);
  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) return { ok: false as const, error: "email-taken" as const };

  const code = String(randomInt(100_000, 1_000_000));
  const identifier = emailChangeId(actor.id);
  await prisma.$transaction([
    prisma.user.update({ where: { id: actor.id }, data: { pendingEmail: email } }),
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: { identifier, token: sha256(`${email}:${code}`), expires: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) },
    }),
  ]);
  await sendVerificationCode(email, code);
  return { ok: true as const };
}

/** Step 2: verify the code, swap pendingEmail into email, revoke sessions. */
export async function confirmEmailChange(actor: Actor, code: string, ctx: AuditContext) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { email: true, pendingEmail: true },
  });
  if (!user.pendingEmail) return { ok: false as const, error: "no-pending" as const };

  const identifier = emailChangeId(actor.id);
  const column = await prisma.verificationToken.findFirst({ where: { identifier } });
  const expected = sha256(`${user.pendingEmail}:${code}`);
  const valid =
    column &&
    column.expires > new Date() &&
    column.token.length === expected.length &&
    timingSafeEqual(Buffer.from(column.token), Buffer.from(expected));
  if (!valid) return { ok: false as const, error: "invalid-code" as const };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: {
        email: user.pendingEmail!,
        emailVerified: new Date(),
        pendingEmail: null,
        sessionsValidFrom: new Date(),
      },
    });
    await tx.verificationToken.deleteMany({ where: { identifier } });
    await writeAudit(tx, ctx, {
      action: "EMAIL_CHANGED",
      targetType: "user",
      targetId: actor.id,
      before: { email: user.email },
      after: { email: user.pendingEmail },
    });
  });
  return { ok: true as const };
}

export async function updateWebhook(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = webhookSchema.parse(raw);
  const data = {
    webhookUrl: nullIfBlank(input.url),
    // Only overwrite the secret when a new one is supplied; a blank field
    // leaves the existing secret intact.
    ...(input.secret ? { webhookSecret: input.secret } : {}),
  };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data });
    await writeAudit(tx, ctx, {
      action: "WEBHOOK_UPDATED",
      targetType: "user",
      targetId: actor.id,
      after: { webhookUrl: data.webhookUrl, secretRotated: Boolean(input.secret) },
    });
  });
  return { ok: true as const };
}

/** Fire a signed test event at the configured webhook and report the result,
 * so a seller can confirm their endpoint before relying on it. */
export async function testWebhook(actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { webhookUrl: true, webhookSecret: true },
  });
  if (!user.webhookUrl) return { ok: false as const, error: "no-webhook" as const };

  const body = JSON.stringify({ type: "ping", at: new Date().toISOString() });
  const signature = user.webhookSecret
    ? createHash("sha256").update(`${user.webhookSecret}.${body}`).digest("hex")
    : "";
  try {
    const res = await fetch(user.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-GWPrint-Signature": signature },
      body,
      signal: AbortSignal.timeout(5000),
    });
    return { ok: true as const, status: res.status };
  } catch (e) {
    return { ok: false as const, error: "unreachable" as const, detail: String(e) };
  }
}

/** The signed-in user's own ledger. Scoped to `actor.id` — never takes a user
 * id from the caller, so it cannot be pointed at someone else's history. */
export async function listMyTransactions(
  actor: Actor,
  opts: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const where = { userId: actor.id };
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, publicId: true, amount: true, type: true, status: true,
        paymentMethod: true, note: true, balanceBefore: true, balanceAfter: true,
        createdAt: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export function listApiKeys(actor: Actor) {
  return prisma.apiKey.findMany({
    where: { userId: actor.id },
    select: API_KEY_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/** Returns the raw key ONCE. It is never retrievable again. */
export async function createApiKey(actor: Actor, raw: unknown, ctx: AuditContext) {
  const { name } = apiKeyCreateSchema.parse(raw);
  await enforceRateLimit(`apikey:${actor.id}`, RATE_LIMITS.apiKeyCreate);
  const { raw: rawKey, prefix, keyHash } = generateApiKey();
  const created = await prisma.$transaction(async (tx) => {
    const key = await tx.apiKey.create({
      data: { userId: actor.id, name, prefix, keyHash },
      select: API_KEY_SELECT,
    });
    await writeAudit(tx, ctx, {
      action: "API_KEY_CREATED",
      targetType: "api_key",
      targetId: String(key.id),
      after: { name, prefix },
    });
    return key;
  });
  return { ...created, raw: rawKey };
}

export async function revokeApiKey(actor: Actor, keyId: number, ctx: AuditContext) {
  // Ownership re-checked here — never trust the id from the client.
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, userId: actor.id },
    select: { id: true, revokedAt: true },
  });
  if (!key) return { ok: false as const, error: "not-found" as const };
  if (key.revokedAt) return { ok: true as const }; // idempotent

  await prisma.$transaction(async (tx) => {
    await tx.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await writeAudit(tx, ctx, {
      action: "API_KEY_REVOKED",
      targetType: "api_key",
      targetId: String(key.id),
    });
  });
  return { ok: true as const };
}

/** Invalidate every session for this user (web and mobile) immediately-ish. */
export async function signOutEverywhere(actor: Actor) {
  await prisma.user.update({
    where: { id: actor.id },
    data: { sessionsValidFrom: new Date() },
  });
  return { ok: true as const };
}
