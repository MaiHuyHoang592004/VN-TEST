import { createHash, randomBytes } from "node:crypto";

import { systemPrisma } from "@orderlane/db";

import type { Ctx } from "../context.ts";
import { NotFoundError } from "../errors.ts";
import { requireRole } from "./tenants.ts";

/**
 * API keys, stored as hashes.
 *
 * SHA-256 rather than bcrypt, deliberately: an API key is 256 bits of
 * randomness this system generated, not a password a human chose. There is no
 * dictionary to attack, so the slow hash buys nothing and costs a lookup on
 * every request. That reasoning does NOT transfer to passwords, which is why
 * User.passwordHash is bcrypt.
 */

const PREFIX = "olk";

export interface IssuedKey {
  readonly id: string;
  /** Shown once, at creation. Never recoverable. */
  readonly plaintext: string;
  readonly prefix: string;
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export async function createApiKey(ctx: Ctx, name: string): Promise<IssuedKey> {
  requireRole(ctx, "OWNER");

  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${PREFIX}_${secret}`;
  // Enough to tell two keys apart in a list, not enough to be worth guessing.
  const prefix = plaintext.slice(0, PREFIX.length + 7);

  const row = await ctx.db.apiKey.create({
    data: { tenantId: ctx.tenantId, name, keyHash: hashApiKey(plaintext), prefix },
  });

  return { id: row.id, plaintext, prefix };
}

export interface VerifiedKey {
  readonly tenantId: string;
  readonly keyId: string;
}

/**
 * Unscoped by necessity: the presented key is what tells us which tenant this
 * is. Looking up by hash rather than by id means a forged id is not a way in.
 */
export async function verifyApiKey(plaintext: string): Promise<VerifiedKey | null> {
  if (!plaintext.startsWith(`${PREFIX}_`)) return null;

  const row = await systemPrisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(plaintext) },
    select: { id: true, tenantId: true, revokedAt: true },
  });
  if (!row || row.revokedAt !== null) return null;

  // Best-effort: a failure to record usage must never fail the request it is
  // observing.
  void systemPrisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { tenantId: row.tenantId, keyId: row.id };
}

export async function revokeApiKey(ctx: Ctx, keyId: string): Promise<void> {
  requireRole(ctx, "OWNER");
  const updated = await ctx.db.apiKey.updateMany({
    where: { id: keyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count === 0) throw new NotFoundError("api key", keyId);
}

export async function listApiKeys(ctx: Ctx) {
  return ctx.db.apiKey.findMany({
    select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}
