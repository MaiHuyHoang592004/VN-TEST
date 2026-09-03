/**
 * Rate-limit invariants. Needs a Postgres DATABASE_URL with the schema
 * applied — the guarantee under test is Postgres serialising concurrent
 * upserts, which no in-memory fake could demonstrate.
 *
 * Run via libs/db/prisma/scripts/test/run-rate-limit-test.sh.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "./client.ts";
import { consumeRateLimit, pruneRateLimits } from "./rate-limit.ts";

const keys: string[] = [];
const key = (name: string) => {
  const k = `test:${name}`;
  keys.push(k);
  return k;
};

after(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } });
  await prisma.$disconnect();
});

test("allows up to the limit, then blocks", async () => {
  const k = key("basic");
  const rule = { limit: 3, windowSec: 60 };

  for (let i = 1; i <= 3; i++) {
    const r = await consumeRateLimit(k, rule);
    assert.equal(r.allowed, true, `attempt ${i} should be allowed`);
    assert.equal(r.count, i);
  }

  const blocked = await consumeRateLimit(k, rule);
  assert.equal(blocked.allowed, false, "the 4th attempt is over the limit");
  assert.ok(blocked.retryAfter > 0, "tells the caller when to retry");
});

test("concurrent attempts cannot exceed the limit", async () => {
  // The case a read-then-write limiter fails: 20 requests at once against a
  // limit of 5 must yield exactly 5 allowed, not 20.
  const k = key("concurrent");
  const rule = { limit: 5, windowSec: 60 };

  const results = await Promise.all(
    Array.from({ length: 20 }, () => consumeRateLimit(k, rule)),
  );
  const allowed = results.filter((r) => r.allowed).length;
  assert.equal(allowed, 5, `expected exactly 5 allowed, got ${allowed}`);

  // Every attempt got a distinct counter value — no lost updates.
  const counts = results.map((r) => r.count).sort((a, b) => a - b);
  assert.deepEqual(counts, Array.from({ length: 20 }, (_, i) => i + 1));
});

test("the window resets once it expires", async () => {
  const k = key("window");
  // A window already in the past: the next hit must start a fresh one.
  const expired = { limit: 1, windowSec: -1 };

  const first = await consumeRateLimit(k, expired);
  assert.equal(first.allowed, true);
  const second = await consumeRateLimit(k, expired);
  assert.equal(second.allowed, true, "expired window resets rather than blocking");
  assert.equal(second.count, 1, "counter restarted at 1");
});

test("separate keys don't interfere", async () => {
  const rule = { limit: 1, windowSec: 60 };
  const a = await consumeRateLimit(key("iso-a"), rule);
  const b = await consumeRateLimit(key("iso-b"), rule);
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true, "one subject's limit must not block another's");
});

test("prune removes only expired rows", async () => {
  const live = key("prune-live");
  const dead = key("prune-dead");
  await consumeRateLimit(live, { limit: 10, windowSec: 3600 });
  await consumeRateLimit(dead, { limit: 10, windowSec: -1 });

  await pruneRateLimits();

  assert.equal(await prisma.rateLimit.count({ where: { key: dead } }), 0, "expired column gone");
  assert.equal(await prisma.rateLimit.count({ where: { key: live } }), 1, "live column kept");
});
