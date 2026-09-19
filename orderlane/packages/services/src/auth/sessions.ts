import { createHash, randomBytes } from "node:crypto";

import { SESSION_COOKIE, SESSION_TOUCH_INTERVAL_MINUTES, SESSION_TTL_DAYS } from "@orderlane/core/auth";
import { systemPrisma } from "@orderlane/db";

/**
 * Opaque session tokens, stored as hashes.
 *
 * The cookie carries 32 random bytes. The database keeps only their SHA-256,
 * so a dump of the sessions table hands an attacker nothing usable — the same
 * reasoning as API keys, and the reason a fast hash is right in both cases:
 * this is machine-generated randomness, not a human-chosen secret, so there is
 * no dictionary for a slow hash to defend against.
 */

// Re-exported so server code has one import for everything session-shaped.
export { SESSION_COOKIE };

export interface SessionMeta {
  readonly userAgent?: string | undefined;
  readonly ip?: string | undefined;
}

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
  readonly sessionId: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createSession(userId: string, meta: SessionMeta = {}): Promise<IssuedSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  const session = await systemPrisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      // Truncated: these are for a person recognising their own sessions, and
      // an unbounded client-supplied string is not something to store whole.
      ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 256) } : {}),
      ...(meta.ip ? { ip: meta.ip.slice(0, 64) } : {}),
    },
  });

  return { token, expiresAt, sessionId: session.id };
}

export interface ResolvedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
}

/**
 * Who this token belongs to, or null.
 *
 * Null for every failure mode — unknown, revoked, expired — because the
 * caller's correct response is the same in all three and distinguishing them
 * only helps somebody probing.
 */
export async function resolveSession(token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token) return null;

  const session = await systemPrisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) return null;

  // Touch, but not on every request: a read-only page load should not become a
  // write for a field nothing urgent depends on.
  const staleBy = Date.now() - session.lastSeenAt.getTime();
  if (staleBy > SESSION_TOUCH_INTERVAL_MINUTES * 60_000) {
    void systemPrisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    email: session.user.email,
    name: session.user.name,
  };
}

/** Revoked, not deleted: "signed out at 14:02" is worth keeping. */
export async function revokeSession(token: string): Promise<void> {
  await systemPrisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * End every session a user has. What "sign out everywhere" means, and what a
 * password change should do — a changed password that leaves old sessions live
 * has not actually locked anybody out.
 */
export async function revokeAllSessions(userId: string, except?: string): Promise<number> {
  const result = await systemPrisma.session.updateMany({
    where: { userId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function listSessions(userId: string) {
  return systemPrisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });
}

/** For a scheduled job. Expired sessions are already unusable; this reclaims the rows. */
export async function purgeExpiredSessions(before = new Date()): Promise<number> {
  const result = await systemPrisma.session.deleteMany({ where: { expiresAt: { lt: before } } });
  return result.count;
}
