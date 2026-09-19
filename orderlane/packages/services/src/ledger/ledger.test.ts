import { after, test } from "node:test";
import assert from "node:assert/strict";

import { ConflictError, ForbiddenError, ValidationError } from "../errors.ts";
import { disconnect, seedFullTenant, skipWithoutDb } from "../testing/harness.ts";
import { balance, chargeOrder, fundWallet, post, refreshSnapshot, refundOrder } from "./postings.ts";

/**
 * These tests do not reset the database between files — see the note in
 * testing/isolation.test.ts. Every tenant here is freshly seeded, so balances
 * start at zero without any global state to manage.
 */
after(async () => {
  if (skipWithoutDb.skip) return;
  await disconnect();
});

test("a wallet starts at zero and grows when it is funded", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  assert.equal(await balance(ctx, "TENANT_WALLET"), 0n);

  await fundWallet(ctx, 50_000n, "bank-transfer-1");
  assert.equal(await balance(ctx, "TENANT_WALLET"), 50_000n);
  assert.equal(await balance(ctx, "TENANT_RECEIVABLE"), 50_000n, "the other side of the same posting");
});

test("charging an order moves money from the wallet to revenue", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await fundWallet(ctx, 50_000n, "funding");
  await chargeOrder(ctx, "order-1", 6_399n);

  assert.equal(await balance(ctx, "TENANT_WALLET"), 50_000n - 6_399n);
  assert.equal(await balance(ctx, "PLATFORM_REVENUE"), 6_399n);
});

test("a refund is a reversal, and it nets exactly to zero", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await fundWallet(ctx, 10_000n, "funding");
  await chargeOrder(ctx, "order-2", 2_500n);
  await refundOrder(ctx, "order-2", 2_500n);

  assert.equal(await balance(ctx, "TENANT_WALLET"), 10_000n);
  assert.equal(await balance(ctx, "PLATFORM_REVENUE"), 0n);

  // The mistake stays visible: two transactions, four entries, nothing edited.
  assert.equal(await ctx.db.ledgerTransaction.count({ where: { reference: "order:order-2" } }), 2);
  assert.equal(await ctx.db.ledgerEntry.count(), 6);
});

test("an unbalanced posting is refused before anything is written", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();

  await assert.rejects(
    () =>
      post(ctx, {
        kind: "ADJUSTMENT",
        idempotencyKey: `bad-${Date.now()}`,
        postings: [
          { account: "TENANT_WALLET", direction: "DEBIT", amountMinor: 1_000n },
          { account: "PLATFORM_REVENUE", direction: "CREDIT", amountMinor: 900n },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.ok((error.details as { code: string }[]).some((i) => i.code === "unbalanced"));
      return true;
    },
  );

  assert.equal(await ctx.db.ledgerTransaction.count(), 0);
  assert.equal(await ctx.db.ledgerEntry.count(), 0);
});

test("a retried charge posts once", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await fundWallet(ctx, 10_000n, "funding");

  const first = await chargeOrder(ctx, "order-3", 1_000n);
  const retry = await chargeOrder(ctx, "order-3", 1_000n);

  assert.equal(first.created, true);
  assert.equal(retry.created, false, "the retry recognised itself rather than erroring");
  assert.equal(retry.transactionId, first.transactionId);
  assert.equal(await balance(ctx, "PLATFORM_REVENUE"), 1_000n, "charged once, not twice");
});

test("two simultaneous charges for the same order still post once", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await fundWallet(ctx, 10_000n, "funding");

  const results = await Promise.all([
    chargeOrder(ctx, "order-race", 1_500n),
    chargeOrder(ctx, "order-race", 1_500n),
  ]);

  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(results[0]!.transactionId, results[1]!.transactionId);
  assert.equal(await balance(ctx, "PLATFORM_REVENUE"), 1_500n);
});

test("a snapshot changes the cost of a balance, never the balance", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  for (let i = 0; i < 12; i++) await fundWallet(ctx, 100n, `f-${i}`);

  const beforeSnapshot = await balance(ctx, "TENANT_WALLET");
  assert.equal(beforeSnapshot, 1_200n);

  const snapshotted = await refreshSnapshot(ctx, "TENANT_WALLET");
  assert.equal(snapshotted, beforeSnapshot);
  assert.equal(await balance(ctx, "TENANT_WALLET"), beforeSnapshot, "reading through the snapshot agrees");

  // Post more; the snapshot is now stale, and the answer is still right.
  await fundWallet(ctx, 350n, "after-snapshot");
  assert.equal(await balance(ctx, "TENANT_WALLET"), 1_550n);

  // Refreshing twice must not double-count what it already counted.
  await refreshSnapshot(ctx, "TENANT_WALLET");
  await refreshSnapshot(ctx, "TENANT_WALLET");
  assert.equal(await balance(ctx, "TENANT_WALLET"), 1_550n);
});

test("deleting every snapshot changes no answer", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await fundWallet(ctx, 4_200n, "funding");
  await chargeOrder(ctx, "order-4", 200n);
  await refreshSnapshot(ctx, "TENANT_WALLET");

  const withCache = await balance(ctx, "TENANT_WALLET");
  await ctx.db.balanceSnapshot.deleteMany({});
  const withoutCache = await balance(ctx, "TENANT_WALLET");

  assert.equal(withoutCache, withCache, "the cache is derived state and nothing more");
  assert.equal(withoutCache, 4_000n);
});

test("balances are per tenant", skipWithoutDb, async () => {
  const a = await seedFullTenant();
  const b = await seedFullTenant();
  await fundWallet(a.ctx, 9_000n, "funding");

  assert.equal(await balance(a.ctx, "TENANT_WALLET"), 9_000n);
  assert.equal(await balance(b.ctx, "TENANT_WALLET"), 0n);
});

test("a viewer cannot post to the ledger", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const viewer = { ...ctx, actor: { ...ctx.actor, role: "VIEWER" as const } };
  await assert.rejects(() => fundWallet(viewer, 100n, "nope"), ForbiddenError);
});

test("a key belonging to another tenant is a conflict, not a silent no-op", skipWithoutDb, async () => {
  const a = await seedFullTenant();
  const b = await seedFullTenant();
  const key = `shared-key-${Date.now().toString(36)}`;

  await post(a.ctx, {
    kind: "ADJUSTMENT",
    idempotencyKey: key,
    postings: [
      { account: "TENANT_WALLET", direction: "CREDIT", amountMinor: 100n },
      { account: "TENANT_RECEIVABLE", direction: "DEBIT", amountMinor: 100n },
    ],
  });

  // Tenant B cannot see A's transaction, so "already posted" would be a lie.
  await assert.rejects(
    () =>
      post(b.ctx, {
        kind: "ADJUSTMENT",
        idempotencyKey: key,
        postings: [
          { account: "TENANT_WALLET", direction: "CREDIT", amountMinor: 100n },
          { account: "TENANT_RECEIVABLE", direction: "DEBIT", amountMinor: 100n },
        ],
      }),
    ConflictError,
  );
  assert.equal(await balance(b.ctx, "TENANT_WALLET"), 0n);
});
