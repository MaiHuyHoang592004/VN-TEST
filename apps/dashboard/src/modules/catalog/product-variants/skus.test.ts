/**
 * The SKU write paths, against a real database.
 *
 * pricing.test.ts proves the RULES with no I/O; this proves the ROUND TRIP —
 * that a price typed as "12.50" survives zod, Prisma.Decimal, a Postgres
 * numeric(12,2) and the read back with its cents intact, and that the tier
 * table ends up exactly as the editor left it.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@opcreative/db";
import { attachVariants, setPrices, bulkSetPrices, listSkusForProduct } from "./service.ts";
import { effectivePrice } from "./pricing.ts";

let adminId: string;
let productId: number;
let variantA: number;
let variantB: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });

before(async () => {
  const a = await prisma.user.create({ data: { email: "sku-admin@test.local", roles: ["ADMIN"] } });
  adminId = a.id;
  const p = await prisma.product.create({ data: { name: "Sku Wallet", key: "sku-wallet", status: "ACTIVE" } });
  productId = p.id;
  const [va, vb] = await Promise.all([
    prisma.variant.create({ data: { name: "Sku Brown", key: "sku-brown" } }),
    prisma.variant.create({ data: { name: "Sku Large", key: "sku-large" } }),
  ]);
  variantA = va.id;
  variantB = vb.id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  const skus = await prisma.productVariant.findMany({ where: { productId }, select: { id: true } });
  await prisma.variantPrice.deleteMany({ where: { productVariantId: { in: skus.map((s) => s.id) } } });
  await prisma.productVariant.deleteMany({ where: { productId } });
  await prisma.variant.deleteMany({ where: { id: productId } });
  await prisma.product.deleteMany({ where: { id: { in: [variantA, variantB] } } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

test("attaching creates the missing SKUs and skips the ones already there", async () => {
  const first = await attachVariants(admin(), { productId, variantIds: [variantA] }, ctx());
  assert.equal(first.created, 1);
  assert.equal(first.skipped, 0);

  // Re-attaching A alongside a new B must not produce a second A column — there
  // is no unique constraint to catch it, so the check is the only guard.
  const second = await attachVariants(admin(), { productId, variantIds: [variantA, variantB] }, ctx());
  assert.equal(second.created, 1, "only B is new");
  assert.equal(second.skipped, 1, "A was recognised as already attached");

  const rows = await listSkusForProduct(admin(), productId);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((r) => r.variantId === variantA).length, 1, "exactly one A column");
});

test("a price survives the trip to Postgres and back with its cents", async () => {
  const [sku] = await listSkusForProduct(admin(), productId);
  await setPrices(admin(), sku.id, [
    { tier: 0, price: "12.50" },
    { tier: 1, price: "12.05" },
    { tier: 3, price: "0.00" },
  ], ctx());

  const rows = await listSkusForProduct(admin(), productId);
  const saved = rows.find((r) => r.id === sku.id)!;
  assert.equal(effectivePrice(saved, 1).toFixed(2), "12.05", "cents are not rounded away");
  assert.equal(effectivePrice(saved, 3).toFixed(2), "0.00", "a zero price round-trips as zero");
  assert.equal(effectivePrice(saved, 2).toFixed(2), "12.50", "an unpriced tier falls back to base");
});

test("clearing a tier removes it — what you see is what is saved", async () => {
  const [sku] = await listSkusForProduct(admin(), productId);
  await setPrices(admin(), sku.id, [{ tier: 0, price: "9.00" }], ctx());

  const left = await prisma.variantPrice.findMany({ where: { productVariantId: sku.id } });
  assert.deepEqual(left.map((r) => r.tier), [0], "tiers 1 and 3 are gone, not stale");
  const rows = await listSkusForProduct(admin(), productId);
  const saved = rows.find((r) => r.id === sku.id)!;
  assert.equal(effectivePrice(saved, 1).toFixed(2), "9.00", "and tier 1 now falls back");
});

test("a table without a base price is refused before anything is written", async () => {
  const [sku] = await listSkusForProduct(admin(), productId);
  await assert.rejects(
    () => setPrices(admin(), sku.id, [{ tier: 2, price: "5.00" }], ctx()),
    "tier 0 is required — every fallback in pricing.ts lands on it",
  );
  const left = await prisma.variantPrice.findMany({ where: { productVariantId: sku.id } });
  assert.deepEqual(left.map((r) => r.tier), [0], "the rejected write left the table untouched");
});

test("bulk pricing writes every selected SKU", async () => {
  const rows = await listSkusForProduct(admin(), productId);
  const r = await bulkSetPrices(admin(), rows.map((x) => x.id), [
    { tier: 0, price: "7.25" },
    { tier: 2, price: "6.75" },
  ], ctx());
  assert.equal(r.updated, 2);

  const after = await listSkusForProduct(admin(), productId);
  for (const sku of after) {
    assert.equal(effectivePrice(sku, 2).toFixed(2), "6.75");
    assert.equal(effectivePrice(sku, 4).toFixed(2), "7.25");
  }
});
