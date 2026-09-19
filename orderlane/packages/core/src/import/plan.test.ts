import { test } from "node:test";
import assert from "node:assert/strict";

import { planImport, summarize } from "./plan.ts";
import { canonicalize, normalizeValue, rowHash } from "./row-hash.ts";
import type { ImportAdapter, ParsedRow, RowValues } from "./types.ts";

interface OrderRow extends RowValues {
  externalRef: string;
  sku: string;
  quantity: number;
}

/** A stand-in adapter: the framework is what is under test, not any one kind. */
const adapter: ImportAdapter<OrderRow> = {
  kind: "ORDERS",
  columns: ["order_ref", "sku", "qty"],
  hashFields: ["externalRef", "sku", "quantity"],
  identityOf: (v) => v.externalRef,
  parse(raw, lineNumber) {
    const externalRef = String(raw["order_ref"] ?? "").trim();
    const sku = String(raw["sku"] ?? "").trim().toLowerCase();
    const quantity = Number(raw["qty"]);
    const issues = [];
    if (!externalRef) issues.push({ field: "order_ref", code: "required", message: "missing order reference" });
    if (!sku) issues.push({ field: "sku", code: "required", message: "missing sku" });
    if (!Number.isInteger(quantity) || quantity < 1) {
      issues.push({ field: "qty", code: "invalid", message: "quantity must be a positive integer" });
    }
    return issues.length > 0
      ? { lineNumber, raw, issues }
      : { lineNumber, raw, issues: [], values: { externalRef, sku, quantity } };
  },
};

const parse = (raws: Record<string, unknown>[]): ParsedRow<OrderRow>[] =>
  raws.map((raw, i) => adapter.parse(raw, i + 1));

const NOTHING: { appliedHashes: ReadonlySet<string>; existingIdentities: ReadonlySet<string> } = {
  appliedHashes: new Set(),
  existingIdentities: new Set(),
};

test("a row's hash is its content, not its position", () => {
  const a = { externalRef: "A-1", sku: "mug-11", quantity: 2 };
  assert.equal(rowHash(a, adapter.hashFields), rowHash({ ...a }, adapter.hashFields));
  // Inserting a line above a row must not change that row's identity: nothing
  // positional is in the hash at all.
  const rows = parse([
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
  ]);
  const shifted = parse([
    { order_ref: "NEW", sku: "print-a3", qty: 1 },
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
  ]);
  assert.equal(
    rowHash(rows[0]!.values!, adapter.hashFields),
    rowHash(shifted[1]!.values!, adapter.hashFields),
  );
});

test("field order in the source file does not change the hash", () => {
  const fields = ["a", "b", "c"];
  assert.equal(canonicalize({ a: "1", b: "2", c: "3" }, fields), canonicalize({ c: "3", b: "2", a: "1" }, fields));
});

test("cosmetic differences normalise away; real ones do not", () => {
  assert.equal(normalizeValue("  two   words "), "two words");
  assert.equal(normalizeValue("   "), null, "a cell of spaces is an empty cell");
  assert.equal(normalizeValue("café"), "café", "NFC: composed and decomposed are one letter");

  const base = { externalRef: "A-1", sku: "mug", quantity: 1 };
  assert.equal(
    rowHash(base, adapter.hashFields),
    rowHash({ ...base, externalRef: " A-1  " }, adapter.hashFields),
  );
  assert.notEqual(
    rowHash(base, adapter.hashFields),
    rowHash({ ...base, quantity: 2 }, adapter.hashFields),
  );
});

test("a string and a number that look alike hash differently", () => {
  const fields = ["v"];
  assert.notEqual(rowHash({ v: "1" }, fields), rowHash({ v: 1 }, fields));
});

test("one invalid row does not stop the others", () => {
  const rows = parse([
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
    { order_ref: "", sku: "mug-11", qty: 2 },
    { order_ref: "A-3", sku: "print-a3", qty: 1 },
  ]);
  const planned = planImport(rows, adapter, NOTHING);
  assert.deepEqual(planned.map((r) => r.status), ["VALID", "INVALID", "VALID"]);
  assert.deepEqual(summarize(planned), { total: 3, create: 2, update: 0, invalid: 1, skipped: 0 });
});

test("an invalid row explains itself per field", () => {
  const [row] = planImport(parse([{ order_ref: "A-1", sku: "mug", qty: "many" }]), adapter, NOTHING);
  assert.equal(row!.status, "INVALID");
  assert.deepEqual(
    row!.issues.map((i) => [i.field, i.code]),
    [["qty", "invalid"]],
  );
});

test("a row already applied by an earlier job is skipped, not duplicated", () => {
  const rows = parse([{ order_ref: "A-1", sku: "mug-11", qty: 2 }]);
  const hash = rowHash(rows[0]!.values!, adapter.hashFields);
  const planned = planImport(rows, adapter, { ...NOTHING, appliedHashes: new Set([hash]) });
  assert.equal(planned[0]!.status, "SKIPPED");
  assert.equal(planned[0]!.action, "NONE");
});

test("the same row twice in one file is caught before the database has to", () => {
  const rows = parse([
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
  ]);
  const planned = planImport(rows, adapter, NOTHING);
  assert.deepEqual(planned.map((r) => r.status), ["VALID", "SKIPPED"]);
  assert.ok(planned[1]!.issues.some((i) => i.code === "duplicate_in_file"));
});

test("an existing business key plans an UPDATE, a new one a CREATE", () => {
  const rows = parse([
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
    { order_ref: "A-2", sku: "print-a3", qty: 1 },
  ]);
  const planned = planImport(rows, adapter, { ...NOTHING, existingIdentities: new Set(["A-1"]) });
  assert.deepEqual(planned.map((r) => r.action), ["UPDATE", "CREATE"]);
});

test("re-uploading a corrected file touches only the row that changed", () => {
  const first = parse([
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
    { order_ref: "A-2", sku: "print-a3", qty: 1 },
    { order_ref: "A-3", sku: "tote", qty: 4 },
  ]);
  const applied = new Set(first.map((r) => rowHash(r.values!, adapter.hashFields)));
  const identities = new Set(first.map((r) => r.values!.externalRef));

  // The operator fixes one quantity and re-uploads the whole file.
  const second = parse([
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
    { order_ref: "A-2", sku: "print-a3", qty: 3 },
    { order_ref: "A-3", sku: "tote", qty: 4 },
  ]);
  const planned = planImport(second, adapter, { appliedHashes: applied, existingIdentities: identities });

  assert.deepEqual(planned.map((r) => r.status), ["SKIPPED", "VALID", "SKIPPED"]);
  assert.deepEqual(summarize(planned), { total: 3, create: 0, update: 1, invalid: 0, skipped: 2 });
});

test("planning is pure — the same input plans the same way twice", () => {
  const rows = parse([
    { order_ref: "A-1", sku: "mug-11", qty: 2 },
    { order_ref: "", sku: "", qty: 0 },
  ]);
  assert.deepEqual(planImport(rows, adapter, NOTHING), planImport(rows, adapter, NOTHING));
});
