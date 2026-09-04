/**
 * Catalogue isolation — the check that makes the partner allow-list real.
 *
 * Prisma connects as one database role with rights to every table, so nothing
 * in Postgres keeps a restricted partner out of a variant they were never
 * granted. The ONLY thing that does is productScope() being spread into every
 * query. That makes this an integration test on purpose: it exercises the real
 * service against a real database, because a unit test with a mocked client
 * would pass just as happily with the scope deleted.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";
import {
  listProducts,
  getProduct,
  createProduct,
  deleteProduct,
  getProductUsage,
} from "./service.ts";

let adminId: string;
let restrictedId: string;
let openSellerId: string;
let allowedProductId: number;
let hiddenProductId: number;
let variantId: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const restricted = () => ({ id: restrictedId, roles: ["SELLER"] as UserRole[] });
const openSeller = () => ({ id: openSellerId, roles: ["SELLER"] as UserRole[] });
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });

before(async () => {
  const [a, r, o] = await Promise.all([
    prisma.user.create({ data: { email: "cat-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "cat-restricted@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "cat-open@test.local", roles: ["SELLER"] } }),
  ]);
  adminId = a.id;
  restrictedId = r.id;
  openSellerId = o.id;

  const [allowed, hidden] = await Promise.all([
    prisma.product.create({ data: { name: "Allowed Wallet", key: "cat-allowed", status: "ACTIVE" } }),
    prisma.product.create({ data: { name: "Hidden Tote", key: "cat-hidden", status: "ACTIVE" } }),
  ]);
  allowedProductId = allowed.id;
  hiddenProductId = hidden.id;

  // Exactly one allow-list row → this partner is restricted to one product.
  await prisma.userAllowedProduct.create({
    data: { userId: restrictedId, productId: allowedProductId },
  });

  const v = await prisma.variant.create({ data: { name: "Brown", key: "cat-brown" } });
  variantId = v.id;
});

after(async () => {
  const userIds = [adminId, restrictedId, openSellerId];
  const productIds = [allowedProductId, hiddenProductId];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.userAllowedProduct.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.variant.deleteMany({ where: { key: { startsWith: "cat-" } } });
  await prisma.product.deleteMany({ where: { id: variantId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test("a restricted partner lists ONLY their allowed products", async () => {
  const { rows, total } = await listProducts(restricted());
  assert.equal(total, 1, "the hidden variant must not be counted either");
  assert.deepEqual(
    rows.map((r) => r.key),
    ["cat-allowed"],
  );
});

test("a restricted partner cannot read a non-allowed variant by guessing its id", async () => {
  // The dangerous case: authorization by permission alone would let this
  // through, because SELLER genuinely holds products.read.
  await assert.rejects(
    () => getProduct(restricted(), hiddenProductId),
    "reading outside the allow-list must throw, not return the column",
  );
  // …and the allowed one still resolves, so the scope isn't just breaking reads.
  const ok = await getProduct(restricted(), allowedProductId);
  assert.equal(ok.key, "cat-allowed");
});

test("a seller with no allow-list rows is unrestricted (absence is permissive)", async () => {
  const { rows } = await listProducts(openSeller());
  const keys = rows.map((r) => r.key);
  assert.ok(keys.includes("cat-allowed"), "sees the allow-listed variant");
  assert.ok(keys.includes("cat-hidden"), "and the one the partner cannot see");
});

test("a search filter cannot widen the scope past the allow-list", async () => {
  // Spreading the scope FIRST is what makes this hold; a filter appended after
  // an unscoped where would happily return the hidden column.
  const { rows } = await listProducts(restricted(), { search: "Hidden" });
  assert.deepEqual(rows, [], "the hidden variant stays hidden even when named");
});

test("a variant in use is never deleted, and an unused one soft-deletes", async () => {
  await prisma.productVariant.create({
    data: { productId: allowedProductId, variantId },
  });
  const used = await deleteProduct(admin(), allowedProductId, ctx(admin()));
  assert.equal(used.ok, false);
  assert.equal(used.ok === false && used.error, "in-use");

  const usage = await getProductUsage(admin(), allowedProductId);
  assert.equal(usage.skus, 1);
  assert.equal(usage.canDelete, false);

  // A clean variant deletes — and leaves its column behind so the unique key
  // cannot be recycled into a different variant's audit history.
  const created = await createProduct(admin(), {
    name: "Disposable", key: "cat-disposable", status: "DRAFT",
  }, ctx(admin()));
  assert.equal(created.ok, true);
  const id = created.ok === true ? created.id : 0;

  assert.equal((await deleteProduct(admin(), id, ctx(admin()))).ok, true);
  const column = await prisma.variant.findUniqueOrThrow({ where: { id } });
  assert.notEqual(column.deletedAt, null, "soft delete, not a real one");
  const { rows } = await listProducts(admin());
  assert.equal(rows.some((r) => r.key === "cat-disposable"), false, "and it leaves the list");
});

test("a duplicate key is refused as data, not as a 500", async () => {
  const dup = await createProduct(admin(), {
    name: "Clash", key: "cat-hidden", status: "DRAFT",
  }, ctx(admin()));
  assert.equal(dup.ok, false);
  assert.equal(dup.ok === false && dup.error, "key-taken");
});
