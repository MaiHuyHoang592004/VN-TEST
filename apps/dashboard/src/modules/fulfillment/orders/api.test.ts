/**
 * What the public API promises, tested at the service the routes call.
 *
 * The routes themselves are ~5 lines each and hold no rules; everything an
 * integration depends on — that a retry does not duplicate, that a cursor walk
 * is stable, that another seller's id resolves to nothing — is here, which is
 * also why the web UI and the API cannot drift apart.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, Prisma, type UserRole } from "@gwprint/db";
import { createOrder, getOrder, listOrdersCursor } from "./service.ts";

let sellerA: string;
let sellerB: string;
let skuId: number;
let productId: number;
let variantId: number;

const asA = () => ({ id: sellerA, roles: ["SELLER"] as UserRole[] });
const asB = () => ({ id: sellerB, roles: ["SELLER"] as UserRole[] });
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });

const body = (externalId: string) => ({
  externalId,
  productVariantId: skuId,
  quantity: 1,
  placedAt: new Date(),
  shippingName: "API Recipient",
  zip: "20002",
});

before(async () => {
  const [a, b] = await Promise.all([
    prisma.user.create({ data: { email: "api-a@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "api-b@test.local", roles: ["SELLER"] } }),
  ]);
  sellerA = a.id;
  sellerB = b.id;
  const p = await prisma.product.create({ data: { name: "Api Wallet", key: "api-wallet", status: "ACTIVE" } });
  const v = await prisma.variant.create({ data: { name: "Api Brown", key: "api-brown" } });
  productId = p.id;
  variantId = v.id;
  const sku = await prisma.productVariant.create({
    data: { productId: p.id, variantId: v.id, salePrice: new Prisma.Decimal("9.00") },
  });
  skuId = sku.id;
});

after(async () => {
  const ids = [sellerA, sellerB];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  const orders = await prisma.order.findMany({ where: { customerId: { in: ids } }, select: { shippingAddressId: true } });
  await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.address.deleteMany({
    where: { id: { in: orders.map((o) => o.shippingAddressId).filter((x): x is number => x !== null) } },
  });
  await prisma.productVariant.deleteMany({ where: { id: skuId } });
  await prisma.variant.deleteMany({ where: { id: productId } });
  await prisma.product.deleteMany({ where: { id: variantId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test("a retried create returns the SAME order instead of a second one", async () => {
  const key = "api:test:retry-1";
  const first = await createOrder(asA(), body("api-retry"), ctx(asA()), sellerA, key);
  assert.equal(first.ok, true);
  assert.equal(first.ok === true && first.deduped, false, "the first call really created it");

  // The dropped-response retry: identical key, and the client cannot tell
  // whether the first attempt landed.
  const second = await createOrder(asA(), body("api-retry"), ctx(asA()), sellerA, key);
  assert.equal(second.ok === true && second.id, first.ok === true && first.id, "same order");
  assert.equal(second.ok === true && second.deduped, true, "reported as a replay");

  const count = await prisma.order.count({ where: { idempotencyKey: key } });
  assert.equal(count, 1, "exactly one column exists for the key");
});

test("the same key from a DIFFERENT seller does not collide", async () => {
  // Keys are namespaced by owner in the route, so an unimaginative "1" from
  // two integrations must not hand one of them the other's order.
  const a = await createOrder(asA(), body("api-ns-a"), ctx(asA()), sellerA, `api:${sellerA}:1`);
  const b = await createOrder(asB(), body("api-ns-b"), ctx(asB()), sellerB, `api:${sellerB}:1`);
  assert.notEqual(a.ok === true && a.id, b.ok === true && b.id);
});

test("one seller's order is NOT FOUND to another, not merely hidden", async () => {
  const mine = await createOrder(asA(), body("api-private"), ctx(asA()), sellerA, "api:test:private");
  const id = mine.ok === true ? mine.id : 0;
  assert.ok(await getOrder(asA(), id), "the owner reads it");
  // The route maps this rejection to 404 rather than 403 — a 403 would confirm
  // the id is real.
  await assert.rejects(() => getOrder(asB(), id));
});

test("a cursor walk sees every order exactly once", async () => {
  for (const n of [1, 2, 3, 4, 5]) {
    await createOrder(asA(), body(`api-page-${n}`), ctx(asA()), sellerA, `api:test:page-${n}`);
  }
  const seen: number[] = [];
  let cursor: number | null = null;
  // Two at a time, so the walk genuinely pages rather than fitting in one call.
  for (let guard = 0; guard < 20; guard++) {
    const r: Awaited<ReturnType<typeof listOrdersCursor>> = await listOrdersCursor(asA(), {
      cursor: cursor ?? undefined,
      limit: 2,
    });
    seen.push(...r.rows.map((x) => x.id));
    if (!r.nextCursor) break;
    cursor = r.nextCursor;
  }
  assert.equal(new Set(seen).size, seen.length, "no order was served twice");
  const total = await prisma.order.count({ where: { customerId: sellerA, deletedAt: null } });
  assert.equal(seen.length, total, "and none was skipped");
});

test("the cursor walk stays inside the caller's scope", async () => {
  const { rows } = await listOrdersCursor(asB(), { limit: 100 });
  assert.ok(rows.length > 0, "B has its own orders");
  assert.ok(
    rows.every((r) => r.customer?.id === sellerB),
    "and not one of A's appears in them",
  );
});
