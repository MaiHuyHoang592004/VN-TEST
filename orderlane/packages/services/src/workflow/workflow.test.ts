import { after, test } from "node:test";
import assert from "node:assert/strict";

import { ConflictError, ForbiddenError, ValidationError } from "../errors.ts";
import { createOrder, listOrders } from "../orders/orders.ts";
import { disconnect, seedCatalog, seedFullTenant, skipWithoutDb } from "../testing/harness.ts";
import type { Ctx } from "../context.ts";
import { setActiveDefinition } from "./definitions.ts";
import { applyTransition, availableTransitions, factsForFulfillment, startFulfillment, transitionHistory } from "./instances.ts";

/**
 * These tests do not reset the database between files.
 *
 * Every test seeds its own tenant, so the product's own isolation boundary is
 * what keeps them apart — which means the suite can run its files in parallel,
 * and a leak between tenants would show up as a failing test rather than as a
 * clean run. A global truncate in each file would fight that: node --test runs
 * files in separate processes, so one file's reset wipes another's fixtures
 * mid-assertion.
 */
after(async () => {
  if (skipWithoutDb.skip) return;
  await disconnect();
});

const shipTo = { name: "A Buyer", line1: "1 Example Street", city: "Springfield", country: "US" };

async function anOrder(ctx: Ctx, lines = [{ sku: "mug-11oz", quantity: 2 }, { sku: "print-12x16", quantity: 1 }]) {
  return createOrder(ctx, { channel: "web", buyer: { name: "A Buyer" }, shipTo, lines });
}

/** A shipment with a tracking number is what makes has_shipping_label true. */
async function giveItALabel(ctx: Ctx, fulfillmentId: string) {
  await ctx.db.shipment.create({
    data: { tenantId: ctx.tenantId, fulfillmentId, carrierKey: "fake", trackingNumber: "FAKE-0001", status: "LABEL_PURCHASED" },
  });
}

test("starting work puts an instance in the initial state and records its birth", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx);

  const started = await startFulfillment(ctx, {
    orderId: order.id,
    lines: order.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })),
  });

  assert.equal(started.stateKey, "received");

  const history = await transitionHistory(ctx, started.instanceId);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.fromState.key, "received");
  assert.equal(history[0]?.toState.key, "received", "the first entry has a from to be honest about");
  assert.equal(history[0]?.transitionId, null, "no transition produced it");
});

test("a parcel cannot contain more than was ordered", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx, [{ sku: "mug-11oz", quantity: 2 }]);
  const line = order.lines[0]!;

  await assert.rejects(
    () => startFulfillment(ctx, { orderId: order.id, lines: [{ orderLineId: line.id, quantity: 3 }] }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal((error.details as { code: string }[])[0]?.code, "over_fulfilled");
      return true;
    },
  );
});

test("one order splits into two parcels that advance independently", skipWithoutDb, async () => {
  // This is the case a single status column on the order cannot represent:
  // the mugs ship today, the print next week, and neither answer is wrong.
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx);
  const [mugs, print] = order.lines;

  const first = await startFulfillment(ctx, { orderId: order.id, lines: [{ orderLineId: mugs!.id, quantity: 2 }] });
  const second = await startFulfillment(ctx, { orderId: order.id, lines: [{ orderLineId: print!.id, quantity: 1 }] });

  await applyTransition(ctx, first.instanceId, "start_picking");
  await applyTransition(ctx, first.instanceId, "mark_packed");

  const listed = await listOrders(ctx);
  assert.deepEqual(listed.items[0]?.states.slice().sort(), ["packed", "received"]);

  // And the second parcel is still exactly where it was.
  const stillThere = await ctx.db.workflowInstance.findUniqueOrThrow({
    where: { id: second.instanceId },
    include: { currentState: true },
  });
  assert.equal(stillThere.currentState.key, "received");
});

test("a guard blocks a move until the facts change", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx);
  const started = await startFulfillment(ctx, {
    orderId: order.id,
    lines: order.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })),
  });

  await applyTransition(ctx, started.instanceId, "start_picking");
  await applyTransition(ctx, started.instanceId, "mark_packed");

  await assert.rejects(
    () => applyTransition(ctx, started.instanceId, "dispatch"),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal((error.details as { code: string }).code, "guard_failed");
      return true;
    },
    "dispatching without a label is exactly what the guard is for",
  );

  await giveItALabel(ctx, started.fulfillmentId);
  const facts = await factsForFulfillment(ctx, started.fulfillmentId);
  assert.equal(facts.flags["has_shipping_label"], true);

  const moved = await applyTransition(ctx, started.instanceId, "dispatch");
  assert.equal(moved.toStateKey, "dispatched");
});

test("available() is what the UI renders, and it tracks facts and role", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx);
  const started = await startFulfillment(ctx, {
    orderId: order.id,
    lines: order.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })),
  });

  const asOwner = await availableTransitions(ctx, started.instanceId);
  assert.deepEqual(asOwner.map((t) => t.key).sort(), ["cancel_early", "start_picking"]);

  const operator = { ...ctx, actor: { ...ctx.actor, role: "OPERATOR" as const } };
  const asOperator = await availableTransitions(operator, started.instanceId);
  assert.deepEqual(asOperator.map((t) => t.key), ["start_picking"], "cancelling needs OWNER");

  const viewer = { ...ctx, actor: { ...ctx.actor, role: "VIEWER" as const } };
  assert.deepEqual(await availableTransitions(viewer, started.instanceId), [], "a viewer sees no buttons");
});

test("a role below the transition's minimum is forbidden, not merely invalid", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx);
  const started = await startFulfillment(ctx, { orderId: order.id, lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }] });

  const viewer = { ...ctx, actor: { ...ctx.actor, role: "VIEWER" as const } };
  await assert.rejects(() => applyTransition(viewer, started.instanceId, "start_picking"), ForbiddenError);
});

test("a stale expectedVersion is a conflict the user is told about", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx);
  const started = await startFulfillment(ctx, { orderId: order.id, lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }] });

  // Two operators render the same screen at version 0.
  await applyTransition(ctx, started.instanceId, "start_picking", { expectedVersion: 0 });
  await assert.rejects(
    () => applyTransition(ctx, started.instanceId, "mark_packed", { expectedVersion: 0 }),
    ConflictError,
    "the second one is acting on a screen that is now out of date",
  );
});

test("a genuine race produces one move and one log entry", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx);
  const started = await startFulfillment(ctx, { orderId: order.id, lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }] });

  // Both calls read version 0 before either writes. The optimistic lock, not
  // luck, is what makes exactly one of them win.
  const results = await Promise.allSettled([
    applyTransition(ctx, started.instanceId, "start_picking"),
    applyTransition(ctx, started.instanceId, "start_picking"),
  ]);

  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof ConflictError);

  const instance = await ctx.db.workflowInstance.findUniqueOrThrow({ where: { id: started.instanceId } });
  assert.equal(instance.version, 1, "one increment, not two");

  const history = await transitionHistory(ctx, started.instanceId);
  assert.equal(history.length, 2, "the birth entry and exactly one transition");
});

test("a full made-to-order run traverses both loops and ends terminal", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  await setActiveDefinition(ctx, "made-to-order");

  const order = await anOrder(ctx, [{ sku: "mug-11oz", quantity: 1 }]);
  const started = await startFulfillment(ctx, {
    orderId: order.id,
    lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }],
    workflowKey: "made-to-order",
  });

  // The proof guard needs artwork on every line.
  const asset = await ctx.db.asset.create({
    data: {
      tenantId: ctx.tenantId,
      kind: "ARTWORK",
      checksum: `chk-${Date.now().toString(36)}`,
      contentType: "image/png",
      byteSize: 1024,
      storageKey: "artwork/one.png",
    },
  });
  await ctx.db.orderLine.updateMany({ where: { orderId: order.id }, data: { artworkAssetId: asset.id } });
  await giveItALabel(ctx, started.fulfillmentId);

  const path = [
    "start_proof",
    "send_proof",
    "request_changes", // the buyer asks for changes — back to proofing
    "send_proof",
    "approve_proof",
    "send_to_qc",
    "qc_rework", // it fails the check — back to production
    "send_to_qc",
    "qc_pass",
    "dispatch",
    "confirm_delivery",
  ];

  let state = started.stateKey;
  for (const transition of path) {
    const outcome = await applyTransition(ctx, started.instanceId, transition);
    assert.equal(outcome.fromStateKey, state, `${transition} should leave ${state}`);
    state = outcome.toStateKey;
  }

  assert.equal(state, "delivered");

  const history = await transitionHistory(ctx, started.instanceId);
  assert.equal(history.length, path.length + 1, "every move is recorded, including the two that went backwards");
  assert.equal(history.filter((h) => h.toState.key === "proofing").length, 2, "proofing was entered twice");
  assert.equal(history.filter((h) => h.toState.key === "in_production").length, 2);

  // And nothing leaves a terminal state.
  await assert.rejects(() => applyTransition(ctx, started.instanceId, "confirm_delivery"), ValidationError);
});

test("the log is append-only: a version bump never rewrites what came before", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await anOrder(ctx);
  const started = await startFulfillment(ctx, { orderId: order.id, lines: [{ orderLineId: order.lines[0]!.id, quantity: 1 }] });

  await applyTransition(ctx, started.instanceId, "start_picking", { note: "picked by the morning shift" });
  const afterFirst = await transitionHistory(ctx, started.instanceId);

  await applyTransition(ctx, started.instanceId, "mark_packed");
  const afterSecond = await transitionHistory(ctx, started.instanceId);

  assert.deepEqual(
    afterSecond.slice(0, afterFirst.length).map((h) => h.id),
    afterFirst.map((h) => h.id),
    "earlier entries are untouched",
  );
  assert.deepEqual(afterFirst[1]?.payload, { note: "picked by the morning shift" });
});

test("a definition with a trap state is refused before it can trap anything", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const { installDefinition } = await import("./definitions.ts");

  await assert.rejects(
    () =>
      installDefinition(ctx, {
        key: "broken",
        version: 1,
        name: "Broken",
        states: [
          { key: "start", label: "Start", kind: "INITIAL" },
          { key: "trap", label: "Trap", kind: "ACTIVE" },
          { key: "done", label: "Done", kind: "TERMINAL" },
        ],
        transitions: [
          { key: "finish", label: "Finish", from: "start", to: "done" },
          { key: "fall_in", label: "Fall in", from: "start", to: "trap" },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.ok((error.details as { code: string }[]).some((i) => i.code === "dead_end_state"));
      return true;
    },
  );

  assert.equal(await ctx.db.workflowDefinition.count({ where: { key: "broken" } }), 0, "nothing was written");
});
