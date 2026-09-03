/**
 * API key generation and verification. Only the SHA-256 hash is ever stored;
 * the raw key exists once, at creation. Shared by the profile actions (create/
 * revoke) and, later, the public /api/v1 auth wrapper (verify).
 */
import { randomBytes, createHash } from "node:crypto";

import { prisma, type SessionUser } from "@opcreative/db";

const PREFIX = "opc_live_";

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a key. Returns the raw value (show ONCE) plus the fields to persist. */
export function generateApiKey(): { raw: string; prefix: string; keyHash: string } {
  const secret = randomBytes(24).toString("base64url"); // 32 chars, url-safe
  const raw = `${PREFIX}${secret}`;
  // Displayable prefix so a user can tell two keys apart without the secret.
  const prefix = raw.slice(0, PREFIX.length + 6);
  return { raw, prefix, keyHash: hashKey(raw) };
}

/**
 * Resolve a presented key to its owner, or null. Enforces the lifecycle rule
 * in one place: matched hash AND not revoked AND not expired. Also stamps
 * lastUsedAt (fire-and-forget — a usage timestamp is not worth blocking the
 * request or failing it).
 */
export async function verifyApiKey(raw: string): Promise<SessionUser | null> {
  if (!raw.startsWith(PREFIX)) return null;
  const key = await prisma.apiKey.findFirst({
    where: {
      keyHash: hashKey(raw),
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true, user: { select: { id: true, roles: true, status: true, deletedAt: true } } },
  });
  if (!key || key.user.status !== "ACTIVE" || key.user.deletedAt) return null;

  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { id: key.user.id, roles: key.user.roles };
}
