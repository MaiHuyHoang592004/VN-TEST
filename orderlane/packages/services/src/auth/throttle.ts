/**
 * Sign-in throttling.
 *
 * In process, on purpose. The domain model deliberately has no rate-limit
 * table — a hot counter written on every failed attempt does not belong in the
 * primary store — and this project has no Redis. So this is a fixed-window
 * counter in memory, and the honest consequence is written here rather than
 * discovered later: it is per instance, so N instances allow N times the
 * attempts, and it resets on deploy.
 *
 * That is still worth having. It stops the single-machine script, which is the
 * attack this actually faces, and the interface is the one a shared store
 * would implement.
 */

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
/** Bounded so a spray across many addresses cannot grow the map without limit. */
const MAX_KEYS = 10_000;

interface Bucket {
  failures: number;
  firstAt: number;
}

const buckets = new Map<string, Bucket>();

export interface ThrottleVerdict {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

const ALLOWED: ThrottleVerdict = { allowed: true, retryAfterMs: 0 };

function currentBucket(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key);
  if (!bucket) return undefined;
  if (now - bucket.firstAt > WINDOW_MS) {
    buckets.delete(key);
    return undefined;
  }
  return bucket;
}

export function checkThrottle(key: string, now = Date.now()): ThrottleVerdict {
  const bucket = currentBucket(key, now);
  if (!bucket || bucket.failures < MAX_FAILURES) return ALLOWED;
  return { allowed: false, retryAfterMs: WINDOW_MS - (now - bucket.firstAt) };
}

export function recordFailure(key: string, now = Date.now()): void {
  const bucket = currentBucket(key, now);
  if (bucket) {
    bucket.failures += 1;
    return;
  }
  if (buckets.size >= MAX_KEYS) {
    // Drop the oldest rather than refusing to track: an attacker who can fill
    // the map must not thereby switch throttling off.
    const oldest = [...buckets.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt)[0];
    if (oldest) buckets.delete(oldest[0]);
  }
  buckets.set(key, { failures: 1, firstAt: now });
}

/** A success clears the record: a person who mistyped twice then got it right is not suspicious. */
export function clearThrottle(key: string): void {
  buckets.delete(key);
}

/** Test seam. */
export function resetThrottle(): void {
  buckets.clear();
}

export const THROTTLE_LIMITS = { windowMs: WINDOW_MS, maxFailures: MAX_FAILURES } as const;
