import { test } from "node:test";
import assert from "node:assert/strict";

import { Workflow } from "./engine.ts";
import { MADE_TO_ORDER, STANDARD_RETAIL } from "./presets.ts";
import type { Actor, SubjectFacts } from "./types.ts";

const operator: Actor = { kind: "USER", id: "u1", role: "OPERATOR" };
const viewer: Actor = { kind: "USER", id: "u2", role: "VIEWER" };
const owner: Actor = { kind: "USER", id: "u3", role: "OWNER" };

const facts = (flags: Record<string, boolean> = {}, counts: Record<string, number> = {}): SubjectFacts => ({
  flags,
  counts,
});

test("a legal move with satisfied guards is allowed", () => {
  const wf = new Workflow(STANDARD_RETAIL);
  const result = wf.attempt("received", "start_picking", operator, {
    facts: facts({}, { lines_missing_stock: 0 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.to.key, "picking");
});

test("a guard that fails blocks the move and says which one", () => {
  const wf = new Workflow(STANDARD_RETAIL);
  const result = wf.attempt("received", "start_picking", operator, {
    facts: facts({}, { lines_missing_stock: 2 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "guard_failed");
  assert.equal(result.ok === false && result.error.failures?.[0]?.guard, "count_is_zero");
});

test("every failing guard is reported, not just the first", () => {
  const wf = new Workflow({
    ...STANDARD_RETAIL,
    transitions: STANDARD_RETAIL.transitions.map((t) =>
      t.key === "mark_packed"
        ? {
            ...t,
            guards: [
              { kind: "flag_is_true", flag: "a" },
              { kind: "flag_is_true", flag: "b" },
            ],
          }
        : t,
    ),
  });
  const result = wf.attempt("picking", "mark_packed", operator, { facts: facts({ a: false, b: false }) });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.failures?.length, 2);
});

test("a role below the transition's minimum is refused", () => {
  const wf = new Workflow(STANDARD_RETAIL);
  const result = wf.attempt("picking", "mark_packed", viewer);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "insufficient_role");
});

test("a higher role satisfies a lower requirement", () => {
  const wf = new Workflow(STANDARD_RETAIL);
  assert.equal(wf.attempt("picking", "mark_packed", owner).ok, true);
});

test("a transition that does not leave the current state is refused", () => {
  const wf = new Workflow(STANDARD_RETAIL);
  const result = wf.attempt("received", "mark_packed", operator);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "wrong_source_state");
});

test("nothing leaves a terminal state", () => {
  const wf = new Workflow(STANDARD_RETAIL);
  const result = wf.attempt("delivered", "confirm_delivery", owner);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, "terminal_state");
});

test("an unknown guard kind denies rather than permits", () => {
  const wf = new Workflow({
    ...STANDARD_RETAIL,
    transitions: STANDARD_RETAIL.transitions.map((t) =>
      t.key === "mark_packed" ? { ...t, guards: [{ kind: "typo_in_config" }] } : t,
    ),
  });
  const result = wf.attempt("picking", "mark_packed", operator);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.failures?.[0]?.code, "unknown_guard");
});

test("available() lists exactly what the actor may do", () => {
  const wf = new Workflow(STANDARD_RETAIL);
  const asOperator = wf.available("received", operator, { facts: facts({}, { lines_missing_stock: 0 }) });
  assert.deepEqual(
    asOperator.map((t) => t.key),
    ["start_picking"],
    "an operator may pick, but cancelling needs OWNER",
  );

  const asOwner = wf.available("received", owner, { facts: facts({}, { lines_missing_stock: 0 }) });
  assert.deepEqual(asOwner.map((t) => t.key).sort(), ["cancel_early", "start_picking"]);

  const blocked = wf.available("received", owner, { facts: facts({}, { lines_missing_stock: 1 }) });
  assert.deepEqual(blocked.map((t) => t.key), ["cancel_early"], "a blocked guard removes the affordance");
});

test("a cycle is an ordinary pair of edges: a proof can go back for changes", () => {
  const wf = new Workflow(MADE_TO_ORDER);
  const out = wf.attempt("awaiting_approval", "request_changes", operator);
  assert.equal(out.ok && out.to.key, "proofing");

  const back = wf.attempt("proofing", "send_proof", operator, {
    facts: facts({}, { lines_missing_artwork: 0 }),
  });
  assert.equal(back.ok && back.to.key, "awaiting_approval", "and forward again, any number of times");
});

test("a full run of the made-to-order process ends in a terminal state", () => {
  const wf = new Workflow(MADE_TO_ORDER);
  const path = [
    ["received", "start_proof"],
    ["proofing", "send_proof"],
    ["awaiting_approval", "request_changes"],
    ["proofing", "send_proof"],
    ["awaiting_approval", "approve_proof"],
    ["in_production", "send_to_qc"],
    ["quality_check", "qc_rework"],
    ["in_production", "send_to_qc"],
    ["quality_check", "qc_pass"],
    ["packed", "dispatch"],
    ["dispatched", "confirm_delivery"],
  ] as const;

  let state = "received";
  for (const [expected, transition] of path) {
    assert.equal(state, expected);
    const result = wf.attempt(state, transition, owner, {
      facts: facts({ has_shipping_label: true }, { lines_missing_artwork: 0 }),
    });
    assert.equal(result.ok, true, `${transition} from ${state} should be legal`);
    if (!result.ok) return;
    state = result.to.key;
  }
  assert.equal(state, "delivered");
  assert.equal(wf.state(state)?.kind, "TERMINAL");
});

test("attempt() is pure — the same call twice gives the same answer", () => {
  const wf = new Workflow(STANDARD_RETAIL);
  const args = [
    "received",
    "start_picking",
    operator,
    { facts: facts({}, { lines_missing_stock: 0 }) },
  ] as const;
  assert.deepEqual(wf.attempt(...args), wf.attempt(...args));
});
