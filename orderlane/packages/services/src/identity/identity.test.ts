import { after, test } from "node:test";
import assert from "node:assert/strict";

import { systemPrisma } from "@orderlane/db";

import { ConflictError, ForbiddenError, NotFoundError } from "../errors.ts";
import { disconnect, makeUser, seedFullTenant, skipWithoutDb } from "../testing/harness.ts";
import { createApiKey, revokeApiKey, verifyApiKey } from "./api-keys.ts";
import { contextForUser, createTenant, requireRole, setMemberRole } from "./tenants.ts";

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

test("a new tenant arrives complete: owner, ledger accounts, both processes", skipWithoutDb, async () => {
  const ownerUserId = await makeUser("owner");
  const { tenantId, ctx } = await createTenant({ slug: `acme-${Date.now().toString(36)}`, name: "Acme", ownerUserId });

  const membership = await systemPrisma.membership.findUnique({
    where: { userId_tenantId: { userId: ownerUserId, tenantId } },
  });
  assert.equal(membership?.role, "OWNER");

  const accounts = await ctx.db.ledgerAccount.findMany();
  assert.deepEqual(
    accounts.map((a) => a.kind).sort(),
    ["PLATFORM_CLEARING", "PLATFORM_REVENUE", "TENANT_RECEIVABLE", "TENANT_WALLET"],
    "a tenant that cannot be charged is not a usable tenant",
  );

  const definitions = await ctx.db.workflowDefinition.findMany({ include: { states: true, transitions: true } });
  assert.deepEqual(definitions.map((d) => d.key).sort(), ["made-to-order", "standard-retail"]);
  assert.equal(definitions.filter((d) => d.isActive).length, 1, "exactly one process is active");
  assert.equal(definitions.find((d) => d.key === "standard-retail")?.isActive, true);

  const mto = definitions.find((d) => d.key === "made-to-order")!;
  assert.equal(mto.states.length, 9);
  assert.equal(mto.transitions.length, 12);
});

test("a duplicate slug is a conflict, not a stack trace", skipWithoutDb, async () => {
  const slug = `dup-${Date.now().toString(36)}`;
  await createTenant({ slug, name: "First", ownerUserId: await makeUser() });

  const secondOwner = await makeUser();
  await assert.rejects(
    () => createTenant({ slug, name: "Second", ownerUserId: secondOwner }),
    ConflictError,
  );
});

test("a stranger cannot get a context for a tenant, and is not told it exists", skipWithoutDb, async () => {
  const { tenantId } = await seedFullTenant();
  const stranger = await makeUser("stranger");

  // NotFound rather than Forbidden: confirming that a tenant exists is itself
  // a disclosure to somebody with no business knowing.
  await assert.rejects(() => contextForUser(stranger, tenantId), NotFoundError);
});

test("a member gets a context carrying their own role", skipWithoutDb, async () => {
  const { tenantId, ownerUserId } = await seedFullTenant();
  const ctx = await contextForUser(ownerUserId, tenantId);
  assert.equal(ctx.actor.role, "OWNER");
  assert.equal(ctx.tenantId, tenantId);
});

test("requireRole enforces a minimum, not an equality", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  assert.doesNotThrow(() => requireRole(ctx, "OPERATOR"), "OWNER exceeds OPERATOR");

  const viewer = { ...ctx, actor: { ...ctx.actor, role: "VIEWER" as const } };
  assert.throws(() => requireRole(viewer, "OPERATOR"), ForbiddenError);
});

test("a tenant cannot be left without an owner", skipWithoutDb, async () => {
  const { ctx, ownerUserId } = await seedFullTenant();
  await assert.rejects(
    () => setMemberRole(ctx, ownerUserId, "VIEWER"),
    ConflictError,
    "demoting the last owner locks everybody out, and there is no way back",
  );

  // With a second owner, the demotion is fine.
  const second = await makeUser("second-owner");
  await systemPrisma.membership.create({ data: { userId: second, tenantId: ctx.tenantId, role: "OWNER" } });
  await setMemberRole(ctx, ownerUserId, "VIEWER");
  assert.equal((await ctx.db.membership.findFirst({ where: { userId: ownerUserId } }))?.role, "VIEWER");
});

test("an api key is shown once and stored only as a hash", skipWithoutDb, async () => {
  const { ctx, tenantId } = await seedFullTenant();
  const issued = await createApiKey(ctx, "CI");

  assert.match(issued.plaintext, /^olk_/);
  const stored = await ctx.db.apiKey.findUniqueOrThrow({ where: { id: issued.id } });
  assert.notEqual(stored.keyHash, issued.plaintext, "the plaintext is never stored");
  assert.equal(stored.keyHash.length, 64, "sha-256 hex");
  assert.ok(issued.plaintext.startsWith(stored.prefix), "the prefix identifies the key without revealing it");

  const verified = await verifyApiKey(issued.plaintext);
  assert.equal(verified?.tenantId, tenantId);
});

test("a wrong, malformed or revoked key verifies as nothing", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const issued = await createApiKey(ctx, "CI");

  assert.equal(await verifyApiKey("not-even-the-right-shape"), null);
  assert.equal(await verifyApiKey(`olk_${"a".repeat(43)}`), null);

  await revokeApiKey(ctx, issued.id);
  assert.equal(await verifyApiKey(issued.plaintext), null, "a revoked key is as good as no key");
});

test("only an owner may issue or revoke keys", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const operator = { ...ctx, actor: { ...ctx.actor, role: "OPERATOR" as const } };
  await assert.rejects(() => createApiKey(operator, "nope"), ForbiddenError);
});
