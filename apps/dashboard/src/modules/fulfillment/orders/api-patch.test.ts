/**
 * PATCH /api/v1/orders/:id, at the service the route calls (doc 07 F1).
 *
 * The rules an integration depends on, and the reason this replaced three
 * legacy endpoints:
 *   · a design URL on a HELD order releases it, back to wherever the hold
 *     came from — that was legacy's resolve-design;
 *   · quantity is editable while PENDING and refused after, because after
 *     assignment somebody is making the thing;
 *   · another seller's order id is a 404-shaped miss, not a column;
 *   · replaying the same body lands on the same state (PATCH is idempotent by
 *     construction, which is why it needs no key).
 *
 * Run: npm run test:money -w @opcreative/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@opcreative/db";

import { patchOrder, PatchError } from "./service/api-patch.ts";
import { updateStatus } from "./service.ts";

let sellerId: string;
let strangerId: string;
let adminId: string;
let orderId: number;

const seller = () => ({ id: sellerId, roles: ["SELLER"] as UserRole[] });
const stranger = () => ({ id: strangerId, roles: ["SELLER"] as UserRole[] });
const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

const statusOf = async (id: number) =>
  (await prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

before(async () => {
  const [s, x, a] = await Promise.all([
    prisma.user.create({ data: { email: "patch-seller@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "patch-stranger@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "patch-admin@test.local", roles: ["ADMIN"] } }),
  ]);
  sellerId = s.id;
  strangerId = x.id;
  adminId = a.id;

  const address = await prisma.address.create({
    data: { name: "First Recipient", line1: "1 Old Road", city: "Hanoi", zip: "10000" },
  });
  const order = await prisma.order.create({
    data: {
      quantity: 1,
      placedAt: new Date(),
      customerId: sellerId,
      externalId: "PATCH-1",
      status: "PENDING",
      shippingAddressId: address.id,
    },
    select: { id: true },
  });
  orderId = order.id;
});

test("a partial body changes only what it names", async () => {
  await patchOrder(seller(), orderId, { note: "leave at the door" }, ctx(seller()));

  const column = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { note: true, quantity: true, externalId: true },
  });
  assert.equal(column.note, "leave at the door");
  assert.equal(column.quantity, 1, "an absent field is left alone, not cleared");
  assert.equal(column.externalId, "PATCH-1");
});

test("the address is patched field by field", async () => {
  await patchOrder(seller(), orderId, { shipping: { city: "Da Nang" } }, ctx(seller()));

  const address = await prisma.order
    .findUniqueOrThrow({ where: { id: orderId }, select: { shippingAddress: true } })
    .then((o) => o.shippingAddress);
  assert.equal(address?.city, "Da Nang");
  assert.equal(address?.line1, "1 Old Road", "the rest of the address survives");
});

test("replaying the same body is a no-op, which is why there is no key", async () => {
  const body = { note: "same again" };
  await patchOrder(seller(), orderId, body, ctx(seller()));
  await patchOrder(seller(), orderId, body, ctx(seller()));

  const column = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { note: true },
  });
  assert.equal(column.note, "same again");
});

test("a design URL releases a held order — legacy's resolve-design", async () => {
  await updateStatus(admin(), orderId, "ON_HOLD", ctx(admin()), "no design supplied");
  assert.equal(await statusOf(orderId), "ON_HOLD");

  const result = await patchOrder(
    seller(),
    orderId,
    { image_url: "https://cdn.example.com/art.png" },
    ctx(seller()),
  );

  assert.equal(result.released, true);
  assert.equal(await statusOf(orderId), "PENDING", "back to where the hold came from");
  const column = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { imageUrl: true },
  });
  assert.equal(column.imageUrl, "https://cdn.example.com/art.png");
});

test("a design URL on an order that is NOT held just sets the field", async () => {
  const result = await patchOrder(
    seller(),
    orderId,
    { image_url: "https://cdn.example.com/art-2.png" },
    ctx(seller()),
  );
  assert.equal(result.released, false);
  assert.equal(await statusOf(orderId), "PENDING");
});

test("quantity is editable while pending and refused after", async () => {
  await patchOrder(seller(), orderId, { quantity: 4 }, ctx(seller()));
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { quantity: true } }))
      .quantity,
    4,
  );

  await updateStatus(admin(), orderId, "ASSIGNED", ctx(admin()));
  await assert.rejects(
    () => patchOrder(seller(), orderId, { quantity: 9 }, ctx(seller())),
    (e) => e instanceof PatchError && codeOf(e) === "not-editable",
  );
  // ...but a note still goes through: it changes nothing anyone is making.
  const still = await patchOrder(seller(), orderId, { note: "still fine" }, ctx(seller()));
  assert.equal(still.ok, true);
});

test("another seller's order id is a miss, not a column", async () => {
  await assert.rejects(
    () => patchOrder(stranger(), orderId, { note: "not mine" }, ctx(stranger())),
    (e) => e instanceof PatchError && codeOf(e) === "not-found",
  );
});

test("an empty body is refused rather than silently doing nothing", async () => {
  await assert.rejects(
    () => patchOrder(seller(), orderId, {}, ctx(seller())),
    (e) => e instanceof PatchError && codeOf(e) === "nothing-to-patch",
  );
});
