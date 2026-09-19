import { test } from "node:test";
import assert from "node:assert/strict";

import {
  UnbalancedTransactionError,
  assertBalanced,
  imbalance,
  projectBalance,
  reverse,
  signedAmount,
  validateTransaction,
} from "./balance.ts";
import type { DraftTransaction, PostedEntry, Posting } from "./types.ts";

const WALLET = "acc_wallet";
const REVENUE = "acc_revenue";

const charge = (amount: bigint): Posting[] => [
  { accountId: WALLET, direction: "DEBIT", amountMinor: amount },
  { accountId: REVENUE, direction: "CREDIT", amountMinor: amount },
];

const draft = (postings: Posting[]): DraftTransaction => ({
  kind: "ORDER_CHARGE",
  currency: "USD",
  idempotencyKey: "order:1:charge",
  postings,
});

test("a balanced transaction passes", () => {
  assert.equal(imbalance(charge(1250n)), 0n);
  assert.doesNotThrow(() => assertBalanced(charge(1250n)));
  assert.deepEqual(validateTransaction(draft(charge(1250n))), []);
});

test("an unbalanced transaction is rejected, and says by how much", () => {
  const broken: Posting[] = [
    { accountId: WALLET, direction: "DEBIT", amountMinor: 1250n },
    { accountId: REVENUE, direction: "CREDIT", amountMinor: 1200n },
  ];
  assert.throws(() => assertBalanced(broken), UnbalancedTransactionError);
  try {
    assertBalanced(broken);
  } catch (error) {
    assert.equal((error as UnbalancedTransactionError).deltaMinor, 50n);
  }
  assert.ok(validateTransaction(draft(broken)).some((i) => i.code === "unbalanced"));
});

test("amounts are positive; the direction carries the sign", () => {
  const issues = validateTransaction(
    draft([
      { accountId: WALLET, direction: "DEBIT", amountMinor: -500n },
      { accountId: REVENUE, direction: "CREDIT", amountMinor: -500n },
    ]),
  );
  assert.ok(issues.some((i) => i.code === "non_positive_amount"));
});

test("a one-sided posting is rejected even when it sums to zero", () => {
  const issues = validateTransaction(
    draft([
      { accountId: WALLET, direction: "DEBIT", amountMinor: 500n },
      { accountId: REVENUE, direction: "DEBIT", amountMinor: 500n },
    ]),
  );
  assert.ok(issues.some((i) => i.code === "single_sided"));
});

test("an idempotency key is required", () => {
  const issues = validateTransaction({ ...draft(charge(100n)), idempotencyKey: "" });
  assert.ok(issues.some((i) => i.code === "missing_idempotency_key"));
});

test("a zero-amount posting is trivially balanced, and still rejected", () => {
  // Worth pinning down: imbalance() sees 0 debits and 0 credits and is happy.
  // "unbalanced" is therefore NOT the check that catches this — non_positive
  // and single_sided are, which is why all three exist.
  const codes = validateTransaction(draft([{ accountId: WALLET, direction: "DEBIT", amountMinor: 0n }]))
    .map((i) => i.code)
    .sort();
  assert.deepEqual(codes, ["non_positive_amount", "single_sided"]);
});

test("every problem is reported at once", () => {
  const issues = validateTransaction({
    kind: "ADJUSTMENT",
    currency: "usd",
    idempotencyKey: "",
    postings: [
      { accountId: WALLET, direction: "DEBIT", amountMinor: 0n },
      { accountId: REVENUE, direction: "DEBIT", amountMinor: 500n },
    ],
  });
  const codes = issues.map((i) => i.code).sort();
  assert.deepEqual(codes, ["invalid_currency", "missing_idempotency_key", "non_positive_amount", "single_sided", "unbalanced"]);
});

test("a reversal cancels the original exactly", () => {
  const original = charge(1250n);
  const combined = [...original, ...reverse(original)];
  assert.equal(imbalance(combined), 0n);

  const entries: PostedEntry[] = combined.map((p) => ({ ...p, accountKind: "TENANT_WALLET" as const }));
  const walletEntries = entries.filter((e) => e.accountId === WALLET);
  assert.equal(projectBalance("TENANT_WALLET", walletEntries), 0n);
});

test("normal side decides the sign: funding a wallet increases it", () => {
  // Tenant sends money in: the platform's cash goes up (debit an asset) and
  // what it owes the tenant goes up (credit the wallet).
  const funding: PostedEntry[] = [
    { accountId: WALLET, direction: "CREDIT", amountMinor: 10_000n, accountKind: "TENANT_WALLET" },
  ];
  assert.equal(projectBalance("TENANT_WALLET", funding), 10_000n, "wallet is credit-normal");

  const spend: PostedEntry[] = [
    { accountId: WALLET, direction: "DEBIT", amountMinor: 2_500n, accountKind: "TENANT_WALLET" },
  ];
  assert.equal(projectBalance("TENANT_WALLET", [...funding, ...spend]), 7_500n);

  const receivable: PostedEntry[] = [
    { accountId: "acc_ar", direction: "DEBIT", amountMinor: 2_500n, accountKind: "TENANT_RECEIVABLE" },
  ];
  assert.equal(projectBalance("TENANT_RECEIVABLE", receivable), 2_500n, "receivable is debit-normal");
  assert.equal(signedAmount(receivable[0]!), 2_500n);
});

test("a snapshot changes how long the answer takes, never the answer", () => {
  const entries: PostedEntry[] = Array.from({ length: 50 }, (_, i) => ({
    accountId: WALLET,
    direction: "CREDIT" as const,
    amountMinor: BigInt(i + 1),
    accountKind: "TENANT_WALLET" as const,
  }));

  const fromScratch = projectBalance("TENANT_WALLET", entries);

  const cut = 30;
  const snapshot = {
    amountMinor: projectBalance("TENANT_WALLET", entries.slice(0, cut)),
    throughEntryId: `entry_${cut}`,
  };
  const fromSnapshot = projectBalance("TENANT_WALLET", entries.slice(cut), snapshot);

  assert.equal(fromSnapshot, fromScratch);
  assert.equal(fromScratch, 1275n);
});

test("an entry from the wrong account is a programming error, not a silent zero", () => {
  assert.throws(
    () =>
      projectBalance("TENANT_WALLET", [
        { accountId: REVENUE, direction: "CREDIT", amountMinor: 1n, accountKind: "PLATFORM_REVENUE" },
      ]),
    TypeError,
  );
});

test("property: across many random balanced transactions, debits always equal credits", () => {
  // Deterministic PRNG so a failure is reproducible from the seed alone.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const all: Posting[] = [];
  for (let i = 0; i < 500; i++) {
    const legs = 1 + Math.floor(rand() * 3);
    const amounts = Array.from({ length: legs }, () => BigInt(1 + Math.floor(rand() * 100_000)));
    const total = amounts.reduce((a, b) => a + b, 0n);
    const postings: Posting[] = [
      ...amounts.map((amountMinor, n) => ({ accountId: `acc_${n}`, direction: "DEBIT" as const, amountMinor })),
      { accountId: "acc_sink", direction: "CREDIT" as const, amountMinor: total },
    ];
    assert.deepEqual(validateTransaction(draft(postings)), [], `transaction ${i} should be well formed`);
    all.push(...postings);
  }
  assert.equal(imbalance(all), 0n, "the books balance in aggregate, not only per transaction");
});
