/**
 * voidLabel() — cancelling a bought label.
 *
 * The KiloShips provider has no `void` implemented (see kiloships.ts's own
 * ponytail comment on why), so every case here exercises the LOCAL half:
 * voidedAt/voidReason land regardless, carrierVoided comes back false, and
 * nothing here ever touches a balance — voiding is not a refund.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";
import { voidLabel, VoidLabelError } from "./void.ts";
import { previewLabels } from "./purchase.ts";

let adminId: string;
let sellerId: string;
let strangerId: string;
let orderId: number;
let shipmentId: number;
let addressId: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const stranger = () => ({ id: strangerId, roles: ["SELLER"] as UserRole[] });
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

before(async () => {
  const [a, s, x] = await Promise.all([
    prisma.user.create({ data: { email: "vt-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "vt-seller@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "vt-stranger@test.local", roles: ["SELLER"] } }),
  ]);
  adminId = a.id;
  sellerId = s.id;
  strangerId = x.id;

  const address = await prisma.address.create({
    data: { name: "Void Test Recipient", line1: "1 Test Way", city: "Testville", state: "NY", zip: "10001", country: "US" },
    select: { id: true },
  });
  addressId = address.id;
  const order = await prisma.order.create({
    data: {
      externalId: "VOID-1",
      customerId: sellerId,
      quantity: 1,
      placedAt: new Date(),
      status: "FULFILLED",
      shippingAddressId: addressId,
      shipments: {
        create: {
          trackingNumber: "VOIDTEST0001",
          labelUrl: "https://example.com/void-test.pdf",
          provider: "kiloships",
          configs: { referenceId: "opc-void-test" },
        },
      },
    },
    select: { id: true, shipments: { select: { id: true } } },
  });
  orderId = order.id;
  shipmentId = order.shipments[0].id;
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [adminId, sellerId, strangerId] } } });
  await prisma.shipment.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.address.deleteMany({ where: { id: addressId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, sellerId, strangerId] } } });
});

test("a reason is required, before anything is touched", async () => {
  await assert.rejects(
    () => voidLabel(admin(), shipmentId, "", ctx(admin())),
    (e: Error) => e instanceof VoidLabelError && codeOf(e) === "reason-required",
  );
  const column = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, select: { voidedAt: true } });
  assert.equal(column.voidedAt, null);
});

test("out of scope is a miss, not a column — a stranger cannot void someone else's label", async () => {
  await assert.rejects(
    () => voidLabel(stranger(), shipmentId, "not mine", ctx(stranger())),
    (e: Error) => e instanceof VoidLabelError && codeOf(e) === "not-found",
  );
});

test("voiding: no carrier `void` means carrierVoided is false, but the local record still lands", async () => {
  const result = await voidLabel(admin(), shipmentId, "Wrong address caught before it shipped", ctx(admin()));
  assert.equal(result.ok, true);
  assert.equal(result.carrierVoided, false, "kiloShips has no void() — see the ponytail in kiloships.ts");

  const column = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { voidedAt: true, voidReason: true, labelUrl: true },
  });
  assert.ok(column.voidedAt, "voided locally regardless of the carrier outcome");
  assert.equal(column.voidReason, "Wrong address caught before it shipped");
  assert.equal(column.labelUrl, "https://example.com/void-test.pdf", "the old label URL is kept as history, not erased");

  const audit = await prisma.auditLog.findFirst({
    where: { action: "LABEL_VOIDED", targetType: "order", targetId: String(orderId) },
  });
  assert.ok(audit, "the void is audited");
});

test("voiding twice is refused, not silently repeated", async () => {
  await assert.rejects(
    () => voidLabel(admin(), shipmentId, "again", ctx(admin())),
    (e: Error) => e instanceof VoidLabelError && codeOf(e) === "already-voided",
  );
});

test("no balance moved — voiding is not a refund", async () => {
  const seller = await prisma.user.findUniqueOrThrow({ where: { id: sellerId }, select: { balance: true } });
  assert.equal(seller.balance.toFixed(2), "0.00");
  const transactions = await prisma.transaction.count({ where: { userId: sellerId } });
  assert.equal(transactions, 0);
});

test("a voided label no longer counts as already-has-a-label — a fresh purchase is not blocked", async () => {
  const { groups } = await previewLabels(admin(), [orderId]);
  // missing-dimensions, not already-has-label: the product here has no box
  // config, so this order was never purchasable anyway — the point is which
  // skip reason it gets. already-has-label would mean the voided shipment is
  // still being treated as live.
  assert.notEqual(groups[0]?.skipReason, "already-has-label");
});
