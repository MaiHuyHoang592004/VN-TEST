import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { HandlerRegistry } from "./handler-registry.js";
import { OutboxLoop } from "./outbox-loop.js";

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

test("run() stops on abort", async () => {
  const loop = new OutboxLoop(prisma, new HandlerRegistry(), { batchSize: 1, leaseSeconds: 30, maxAttempts: 1, pollMs: 10 });
  const ac = new AbortController();
  const done = loop.run(ac.signal);
  setTimeout(() => ac.abort(), 50);
  await done; // resolves instead of hanging
  assert.ok(true);
});
