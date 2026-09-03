/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * Lives in libs/db (not the app) because libs/auth needs it too — the OTP
 * sender is the single most abusable endpoint we have — and auth builds on db.
 *
 * ATOMICITY IS THE POINT. A read-then-write limiter is not a limiter: two
 * concurrent requests both read count=4, both write 5, and the fifth attempt
 * that should have been blocked goes through. The counter is therefore bumped
 * in ONE statement, and Postgres serialises the conflicting upserts for us.
 *
 * TIMEZONE: Prisma stores DateTime as `timestamp` (no zone) holding UTC, while
 * `now()` is a `timestamptz`. Comparing them directly makes Postgres convert
 * using the SESSION timezone, so on any non-UTC server every window looks
 * already expired and the limiter silently never limits. Hence the explicit
 * `now() AT TIME ZONE 'UTC'`.
 */
import { prisma } from "./client.ts";

export type RateLimitResult = {
  allowed: boolean;
  /** Attempts used in the current window, including this one. */
  count: number;
  /** Seconds until the window resets (0 when allowed). */
  retryAfter: number;
};

export type RateLimitRule = {
  /** Max attempts inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
};

/** Sensible defaults for the paths that actually get attacked. Tune from real
 * traffic rather than guesswork — these are deliberately generous enough not
 * to trip a normal user and strict enough to stop scripted abuse. */
export const RATE_LIMITS = {
  /** Emailing a code costs us money and spams a stranger's inbox. */
  otpSend: { limit: 5, windowSec: 15 * 60 },
  /** Guessing a 6-digit code: 10 tries makes brute force hopeless. */
  otpVerify: { limit: 10, windowSec: 15 * 60 },
  /** Password guessing, per email and per IP. */
  login: { limit: 10, windowSec: 15 * 60 },
  passwordChange: { limit: 5, windowSec: 60 * 60 },
  emailChange: { limit: 5, windowSec: 60 * 60 },
  apiKeyCreate: { limit: 10, windowSec: 60 * 60 },
  /** Public API, per key. */
  api: { limit: 600, windowSec: 60 },
  /**
   * ⌘K, per user. Each search fans out to several unindexed ILIKE scans (see
   * modules/platform/search), so this is a COST limit, not an abuse one: a
   * human typing at 200ms debounce peaks around 5/s in bursts and never
   * approaches 90/min, while a script hammering the box is stopped before it
   * costs the database anything.
   */
  search: { limit: 90, windowSec: 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Count one attempt against `key` and say whether it is allowed.
 *
 * Fails OPEN: if the database is unreachable the request proceeds. A limiter
 * that takes the whole site down when Postgres hiccups trades a small abuse
 * risk for a total outage — the wrong trade for these endpoints. Auth itself
 * still needs the database, so this cannot become a bypass.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const expires = new Date(Date.now() + rule.windowSec * 1000);
  try {
    const rows = await prisma.$queryRaw<{ count: number; expires_at: Date }[]>`
      INSERT INTO rate_limits (key, count, expires_at)
      VALUES (${key}, 1, ${expires})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limits.expires_at < (now() AT TIME ZONE 'UTC') THEN 1
          ELSE rate_limits.count + 1
        END,
        expires_at = CASE
          WHEN rate_limits.expires_at < (now() AT TIME ZONE 'UTC') THEN ${expires}
          ELSE rate_limits.expires_at
        END
      RETURNING count, expires_at
    `;
    const column = rows[0];
    if (!column) return { allowed: true, count: 0, retryAfter: 0 };

    const allowed = column.count <= rule.limit;
    return {
      allowed,
      count: column.count,
      retryAfter: allowed
        ? 0
        : Math.max(0, Math.ceil((column.expires_at.getTime() - Date.now()) / 1000)),
    };
  } catch {
    return { allowed: true, count: 0, retryAfter: 0 };
  }
}

/** Throwable product for call sites that just want to bail.
 * Written without a TS parameter property so Node's type-stripping can run
 * this file directly under `node --test`. */
export class RateLimitError extends Error {
  retryAfter: number;

  constructor(retryAfter: number) {
    super(`Too many attempts. Try again in ${retryAfter}s.`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export async function enforceRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  const result = await consumeRateLimit(key, rule);
  if (!result.allowed) throw new RateLimitError(result.retryAfter);
}

/**
 * Delete expired counters. Nothing calls this on a schedule yet.
 * ponytail: rows for one-off keys accumulate until something prunes them —
 * harmless at our volume (a few thousand rows), but wire this to a daily cron
 * (Vercel Cron today, EventBridge on ECS) before real traffic.
 */
export async function pruneRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
