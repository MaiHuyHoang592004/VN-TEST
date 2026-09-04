/**
 * createOrder/createOrders/updateOrder — the parts of the money path that
 * are not assign or refund.
 *
 * Two guarantees added here, both about a WRITE landing twice or landing
 * over someone else's:
 *   • createOrders (the spreadsheet importer) derives its own idempotency
 *     key per row, so a resubmitted batch — the same file re-uploaded after
 *     a timeout, or the Import button hit twice — creates each row exactly
 *     once instead of duplicating the whole batch;
 *   • updateOrder refuses to change quantity once an order has left PENDING
 *     (it has already been priced and charged by then), and, when a caller
 *     supplies the `updatedAt` it read, refuses a write that would silently
 *     overwrite a save that landed in between.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";
import { createOrder, createOrders, updateOrder } from "./service.ts";

let adminId: string;
let sellerId: string;
let skuId: number;
let productId: number;
let variantId: number;
const orderIds: number[] = [];

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });

const row = (overrides: Record<string, unknown> = {}) => ({
  externalId: `wr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  productVariantId: skuId,
  quantity: 1,
  placedAt: new Date(),
  shippingName: "Test Recipient",
  zip: "10001",
  ...overrides,
});

before(async () => {
  const [a, s] = await Promise.all([
    prisma.user.create({ data: { email: "wr-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "wr-seller@test.local", roles: ["SELLER"] } }),
  ]);
  adminId = a.id;
  sellerId = s.id;

  const p = await prisma.product.create({ data: { name: "Writes Wallet", key: "wr-wallet", status: "ACTIVE" } });
  const v = await prisma.variant.create({ data: { name: "Writes Brown", key: "wr-brown" } });
  productId = p.id;
  variantId = v.id;
  const sku = await prisma.productVariant.create({ data: { productId: p.id, variantId: v.id } });
  skuId = sku.id;
});

after(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  const addresses = await prisma.address.findMany({
    where: { name: "Test Recipient" },
    select: { id: true },
  });
  await prisma.address.deleteMany({ where: { id: { in: addresses.map((a) => a.id) } } });
  await prisma.productVariant.deleteMany({ where: { id: skuId } });
  await prisma.variant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, sellerId] } } });
});

test("createOrder with an idempotencyKey: a retry returns the SAME order", async () => {
  const key = `wr-key-${Date.now()}`;
  const first = await createOrder(admin(), row(), ctx(), sellerId, key);
  assert.equal(first.ok, true);
  if (first.ok) orderIds.push(first.id);

  const retry = await createOrder(admin(), row(), ctx(), sellerId, key);
  assert.equal(retry.ok, true);
  assert.equal(retry.ok && retry.deduped, true);
  assert.equal(retry.ok && first.ok && retry.id, first.ok && first.id, "the same order, not a second one");

  const count = await prisma.order.count({ where: { customerId: sellerId, idempotencyKey: key } });
  assert.equal(count, 1);
});

test("createOrders: a resubmitted batch creates each row exactly once", async () => {
  const rows = [row(), row(), row()];

  const first = await createOrders(admin(), rows, ctx(), sellerId);
  assert.equal(first.created, 3);
  assert.equal(first.failed, 0);
  first.results.forEach((r) => r.id && orderIds.push(r.id));

  // The identical batch, re-submitted — a timeout retry or a double-click on
  // Import, with the SAME row objects (a re-parsed identical file).
  const retry = await createOrders(admin(), rows, ctx(), sellerId);
  assert.equal(retry.created, 3, "each row dedupes to its own earlier order, not a failure");
  retry.results.forEach((r) => assert.equal(r.error, undefined));

  const externalIds = rows.map((r) => (r as { externalId: string }).externalId);
  const count = await prisma.order.count({
    where: { customerId: sellerId, externalId: { in: externalIds } },
  });
  assert.equal(count, 3, "not 6 — the retry created nothing new");

  // A genuinely NEW row in the same call still gets created — position is
  // part of the key precisely so this does not get swept up as a dup.
  const withOneNew = [...rows, row()];
  const third = await createOrders(admin(), withOneNew, ctx(), sellerId);
  assert.equal(third.created, 4);
  third.results.forEach((r) => r.id && orderIds.push(r.id));
});

test("updateOrder: quantity is locked once the order leaves PENDING", async () => {
  const created = await createOrder(admin(), row({ quantity: 2 }), ctx(), sellerId);
  assert.equal(created.ok, true);
  const id = created.ok ? created.id : 0;
  orderIds.push(id);

  // Still PENDING: quantity moves freely.
  const first = await updateOrder(admin(), id, row({ quantity: 5 }), ctx());
  assert.equal(first.ok, true);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id }, select: { quantity: true } })).quantity,
    5,
  );

  await prisma.order.update({ where: { id }, data: { status: "ASSIGNED", paid: true } });

  const blocked = await updateOrder(admin(), id, row({ quantity: 9 }), ctx());
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false && blocked.error, "quantity-locked");
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id }, select: { quantity: true } })).quantity,
    5,
    "the blocked write changed nothing",
  );

  // The SAME quantity is not a "change" — it goes through like any other field.
  const noop = await updateOrder(admin(), id, row({ quantity: 5, note: "still fine" }), ctx());
  assert.equal(noop.ok, true);
});

test("updateOrder: a CANCELLED order locks marketplace/internalNote too, but note/deadline still move", async () => {
  const created = await createOrder(admin(), row({ marketplace: "Etsy" }), ctx(), sellerId);
  assert.equal(created.ok, true);
  const id = created.ok ? created.id : 0;
  orderIds.push(id);
  await prisma.order.update({ where: { id }, data: { status: "CANCELLED" } });

  const blocked = await updateOrder(admin(), id, row({ marketplace: "Amazon" }), ctx());
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false && blocked.error, "not-editable");
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id }, select: { marketplace: true } })).marketplace,
    "Etsy",
    "the blocked write changed nothing",
  );

  // note is in EDITABLE_AFTER_PENDING (matches patchOrder) — still allowed.
  const allowed = await updateOrder(admin(), id, row({ marketplace: "Etsy", note: "refund pending" }), ctx());
  assert.equal(allowed.ok, true);
});

test("updateOrder: a stale expectedUpdatedAt loses the race", async () => {
  const created = await createOrder(admin(), row(), ctx(), sellerId);
  assert.equal(created.ok, true);
  const id = created.ok ? created.id : 0;
  orderIds.push(id);

  const before = await prisma.order.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });

  // Someone else's save lands first.
  await updateOrder(admin(), id, row({ note: "the other party's edit" }), ctx());

  // A caller starting from the now-stale updatedAt loses instead of clobbering it.
  const conflict = await updateOrder(
    admin(),
    id,
    row({ note: "clobbers the other edit" }),
    ctx(),
    before.updatedAt,
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.ok === false && conflict.error, "conflict");
  const stillTheOtherEdit = await prisma.order.findUniqueOrThrow({
    where: { id },
    select: { note: true, updatedAt: true },
  });
  assert.equal(stillTheOtherEdit.note, "the other party's edit");

  // The current updatedAt proves the caller re-read before writing.
  const fresh = await updateOrder(
    admin(),
    id,
    row({ note: "a fresh read, then a fresh write" }),
    ctx(),
    stillTheOtherEdit.updatedAt,
  );
  assert.equal(fresh.ok, true);
});
