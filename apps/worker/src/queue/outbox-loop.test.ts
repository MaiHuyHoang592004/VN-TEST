import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { HandlerRegistry } from "./handler-registry.js";
import { OutboxLoop } from "./outbox-loop.js";
import { BusinessOutboxError, RetryableOutboxError } from "./outbox-errors.js";

before(async () => { await prisma.outboxEvent.deleteMany({ where: { handler: { startsWith: "test." } } }); });
after(async () => { await prisma.$disconnect(); });

test("tick dispatches to the registered handler and marks SENT; unknown handler dead-letters", async () => {
  const seen: unknown[] = [];
  const registry = new HandlerRegistry();
  registry.register("test.echo", async (e) => { seen.push(e.payload); });
  await prisma.outboxEvent.createMany({ data: [
    { eventKey: `test.echo:${Date.now()}`, aggregateType: "T", aggregateId: "1", handler: "test.echo", payload: { hi: 1 } },
    { eventKey: `test.unknown:${Date.now()}`, aggregateType: "T", aggregateId: "2", handler: "test.unknown", payload: {} },
  ]});
  const loop = new OutboxLoop(prisma, registry, { batchSize: 10, leaseSeconds: 30, maxAttempts: 1, pollMs: 10 });
  const processed = await loop.tick();
  assert.equal(processed, 2);
  assert.deepEqual(seen, [{ hi: 1 }]);
  const rows = await prisma.outboxEvent.findMany({ where: { handler: { startsWith: "test." } }, orderBy: { handler: "asc" } });
  assert.equal(rows[0].status, "SENT");
  assert.equal(rows[1].status, "DEAD_LETTER");
  assert.match(rows[1].lastError ?? "", /no handler registered/);
});

test("a BusinessOutboxError dead-letters immediately, ignoring maxAttempts", async () => {
  const registry = new HandlerRegistry();
  registry.register("test.business", async () => { throw new BusinessOutboxError("userErrors: bad line item"); });
  const { id } = await prisma.outboxEvent.create({ data: {
    eventKey: `test.business:${Date.now()}`, aggregateType: "T", aggregateId: "3", handler: "test.business", payload: {},
  } });
  const loop = new OutboxLoop(prisma, registry, { batchSize: 10, leaseSeconds: 30, maxAttempts: 8, pollMs: 10 });
  await loop.tick();
  const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
  assert.equal(row.status, "DEAD_LETTER");
  assert.equal(row.attempts, 1, "dead-lettered on the very first attempt, not after 8");
});

test("a RetryableOutboxError with retryAfterSeconds overrides the default backoff", async () => {
  const registry = new HandlerRegistry();
  registry.register("test.throttled", async () => { throw new RetryableOutboxError("throttled", 5); });
  const { id } = await prisma.outboxEvent.create({ data: {
    eventKey: `test.throttled:${Date.now()}`, aggregateType: "T", aggregateId: "4", handler: "test.throttled", payload: {},
  } });
  const loop = new OutboxLoop(prisma, registry, { batchSize: 10, leaseSeconds: 30, maxAttempts: 8, pollMs: 10 });
  await loop.tick();
  const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
  assert.equal(row.status, "PENDING");
  const waitMs = row.availableAt.getTime() - Date.now();
  assert.ok(waitMs > 1000 && waitMs <= 6000, `expected ~5s wait, got ${waitMs}ms`);
});

test("run() stops on abort", async () => {
  const loop = new OutboxLoop(prisma, new HandlerRegistry(), { batchSize: 1, leaseSeconds: 30, maxAttempts: 1, pollMs: 10 });
  const ac = new AbortController();
  const done = loop.run(ac.signal);
  setTimeout(() => ac.abort(), 50);
  await done; // resolves instead of hanging
  assert.ok(true);
});
