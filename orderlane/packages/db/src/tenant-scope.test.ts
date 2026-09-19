import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { TENANT_SCOPED_MODELS, isTenantScoped, scopeArgs } from "./tenant-scope.ts";

const here = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(here, "..", "prisma", "schema", "models");

/**
 * Reads the schema rather than trusting the list. Adding a model with a
 * tenantId and forgetting to scope it is exactly the mistake this file exists
 * to prevent, so the check cannot itself be a hand-maintained list.
 */
function modelsWithTenantId(): string[] {
  const found: string[] = [];
  for (const file of readdirSync(modelsDir).filter((f) => f.endsWith(".prisma"))) {
    const source = readFileSync(join(modelsDir, file), "utf8");
    // Split on top-level `model X {` blocks and look for a tenantId field.
    const blocks = source.split(/\bmodel\s+/).slice(1);
    for (const block of blocks) {
      const name = block.match(/^(\w+)/)?.[1];
      if (!name) continue;
      const body = block.slice(0, block.indexOf("\n}"));
      if (/^\s*tenantId\s+String/m.test(body)) found.push(name);
    }
  }
  return found.sort();
}

test("every model with a tenantId column is in TENANT_SCOPED_MODELS", () => {
  const fromSchema = modelsWithTenantId();
  const fromCode: string[] = [...TENANT_SCOPED_MODELS].sort();

  const missing = fromSchema.filter((m) => !fromCode.includes(m));
  const extra = fromCode.filter((m) => !fromSchema.includes(m));

  assert.deepEqual(missing, [], "these models carry tenantId but are not scoped — queries on them would leak");
  assert.deepEqual(extra, [], "these models are scoped but have no tenantId — every query on them would fail");
  assert.ok(fromSchema.length > 10, "sanity: the schema parser found models at all");
});

test("a model without a tenantId is left alone", () => {
  assert.equal(isTenantScoped("User"), false, "a person can belong to several tenants");
  assert.equal(isTenantScoped("Tenant"), false, "the tenant table is the boundary, not inside it");
  assert.equal(isTenantScoped("Order"), true);
});

test("a caller cannot widen its own scope", () => {
  const scoped = scopeArgs("findMany", { where: { tenantId: "someone_else", status: "ACTIVE" } }, "mine");
  assert.deepEqual(scoped, { where: { tenantId: "mine", status: "ACTIVE" } });

  const created = scopeArgs("create", { data: { tenantId: "someone_else", title: "x" } }, "mine");
  assert.deepEqual(created, { data: { tenantId: "mine", title: "x" } });
});

test("createMany scopes every row, including a single-object form", () => {
  const many = scopeArgs("createMany", { data: [{ sku: "a" }, { sku: "b", tenantId: "other" }] }, "mine");
  assert.deepEqual(many, { data: [{ sku: "a", tenantId: "mine" }, { sku: "b", tenantId: "mine" }] });

  const one = scopeArgs("createMany", { data: { sku: "a" } }, "mine");
  assert.deepEqual(one, { data: [{ sku: "a", tenantId: "mine" }] });
});

test("upsert scopes the lookup and the row it would create", () => {
  const args = scopeArgs("upsert", { where: { id: "x" }, create: { sku: "a" }, update: { sku: "b" } }, "mine");
  assert.deepEqual(args, {
    where: { id: "x", tenantId: "mine" },
    create: { sku: "a", tenantId: "mine" },
    update: { sku: "b" },
  });
});

test("a where-less query still gets a filter rather than returning everything", () => {
  assert.deepEqual(scopeArgs("findMany", {}, "mine"), { where: { tenantId: "mine" } });
  assert.deepEqual(scopeArgs("count", { where: undefined }, "mine"), { where: { tenantId: "mine" } });
});

test("an unrecognised operation is refused, not waved through", () => {
  assert.throws(
    () => scopeArgs("someFutureOperation", {}, "mine"),
    /unhandled operation "someFutureOperation"/,
  );
});

test("an update cannot give a row away to another tenant", () => {
  // The where-clause filter proves the row belongs to the caller. Without this,
  // the payload could then hand it to somebody else — a boundary crossing that
  // passes every check the filter performs.
  assert.deepEqual(
    scopeArgs("update", { where: { id: "x" }, data: { title: "ok", tenantId: "someone_else" } }, "mine"),
    { where: { id: "x", tenantId: "mine" }, data: { title: "ok" } },
  );

  assert.deepEqual(
    scopeArgs("updateMany", { where: { status: "ACTIVE" }, data: { tenantId: "someone_else" } }, "mine"),
    { where: { status: "ACTIVE", tenantId: "mine" }, data: {} },
  );
});

test("upsert strips the tenant from its update half and merges it into its create half", () => {
  assert.deepEqual(
    scopeArgs(
      "upsert",
      { where: { id: "x" }, create: { sku: "a", tenantId: "other" }, update: { sku: "b", tenantId: "other" } },
      "mine",
    ),
    {
      where: { id: "x", tenantId: "mine" },
      create: { sku: "a", tenantId: "mine" },
      update: { sku: "b" },
    },
  );
});

test("an update payload without a tenantId is passed through untouched", () => {
  const args = { where: { id: "x" }, data: { title: "ok", priceMinor: 100 } };
  const scoped = scopeArgs("update", args, "mine");
  assert.deepEqual(scoped["data"], { title: "ok", priceMinor: 100 });
  assert.equal(scoped["data"], args.data, "no needless copy when there is nothing to strip");
});
