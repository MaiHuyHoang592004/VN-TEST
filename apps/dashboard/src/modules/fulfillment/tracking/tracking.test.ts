/**
 * Inbound carrier tracking: the signature rule, and the restraint rule.
 *
 * The first test is the important one. Legacy skipped signature verification
 * whenever the secret was unconfigured, which meant its "verified" webhook was
 * an unauthenticated write endpoint on any deploy where an env var was
 * forgotten — and nothing about that failure was visible. It has to be
 * asserted, because it is invisible when it is wrong.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { prisma, type UserRole } from "@gwprint/db";
import { applyTrackingUpdate, verifyTrackingSignature } from "./service.ts";

const SECRET = "tracking-test-secret";
let sellerId: string;
let orderId: number;
let shipmentId: number;

const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");

before(async () => {
  const seller = await prisma.user.create({
    data: { email: "trk-seller@test.local", roles: ["SELLER"] as UserRole[] },
  });
  sellerId = seller.id;
  const order = await prisma.order.create({
    data: {
      externalId: "TRK-1",
      customerId: sellerId,
      quantity: 1,
      placedAt: new Date(),
      status: "SHIPPED",
      shipments: { create: { trackingNumber: "TRKTEST0001", trackingStatus: "CREATED" } },
    },
    select: { id: true, shipments: { select: { id: true } } },
  });
  orderId = order.id;
  shipmentId = order.shipments[0].id;
});

beforeEach(async () => {
  process.env.DRX_WEBHOOK_SECRET = SECRET;
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { trackingStatus: "CREATED" },
  });
  await prisma.notification.deleteMany({ where: { userId: sellerId } });
});

after(async () => {
  delete process.env.DRX_WEBHOOK_SECRET;
  await prisma.notification.deleteMany({ where: { userId: sellerId } });
  await prisma.shipment.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.user.deleteMany({ where: { id: sellerId } });
  await prisma.$disconnect();
});

test("an unsigned payload is refused — and a MISSING secret refuses everything", () => {
  const body = JSON.stringify({ trackingNumber: "TRKTEST0001", status: "delivered" });

  assert.equal(verifyTrackingSignature(body, sign(body)), true, "a good signature passes");
  assert.equal(verifyTrackingSignature(body, null), false, "no signature, no entry");
  assert.equal(verifyTrackingSignature(body, "deadbeef"), false, "a wrong signature fails");
  assert.equal(
    verifyTrackingSignature(body, sign(body, "some-other-secret")),
    false,
    "signed with the wrong key is still forged",
  );
  assert.equal(
    verifyTrackingSignature(body + " ", sign(body)),
    false,
    "the signature covers the exact bytes — a changed body is a changed signature",
  );

  // THE LEGACY HOLE. With no secret configured it skipped the check entirely,
  // turning this into an open write endpoint. Here it refuses instead.
  delete process.env.DRX_WEBHOOK_SECRET;
  assert.equal(
    verifyTrackingSignature(body, sign(body)),
    false,
    "no secret configured must mean NO updates, never unverified ones",
  );
});

test("a carrier update lands on the shipment and tells the seller once", async () => {
  const first = await applyTrackingUpdate({ trackingNumber: "TRKTEST0001", status: "delivered" });
  assert.equal(first.updated, 1);
  assert.equal(first.notified, 1);

  const column = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { trackingStatus: true },
  });
  assert.equal(column.trackingStatus, "delivered");

  // Carriers re-deliver the same webhook. Idempotent by construction: an
  // unchanged status writes nothing and rings nothing.
  const repeat = await applyTrackingUpdate({ trackingNumber: "TRKTEST0001", status: "delivered" });
  assert.equal(repeat.updated, 0);
  assert.equal(repeat.notified, 0);

  const bells = await prisma.notification.count({
    where: { userId: sellerId, type: "TRACKING_UPDATED" },
  });
  assert.equal(bells, 1, "one delivery, one bell, however many times it is sent");
});

test("routine scans update the column silently — only outcomes reach the bell", async () => {
  const moved = await applyTrackingUpdate({
    trackingNumber: "TRKTEST0001",
    status: "in_transit",
  });
  assert.equal(moved.updated, 1, "the column still learns where the parcel is");
  assert.equal(moved.notified, 0, "but a bell per scan is a bell nobody reads");

  const problem = await applyTrackingUpdate({
    trackingNumber: "TRKTEST0001",
    status: "exception: address unknown",
  });
  assert.equal(problem.notified, 1, "a problem is exactly what a seller must hear");
});

test("an unknown tracking number is a no-op, not an error", async () => {
  const result = await applyTrackingUpdate({ trackingNumber: "NOT-OURS-9999", status: "delivered" });
  assert.deepEqual(result, { updated: 0, notified: 0 });
});

test("the order's own status is NOT moved by the carrier", async () => {
  await applyTrackingUpdate({ trackingNumber: "TRKTEST0001", status: "delivered" });
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true },
  });
  // Tracking is a separate axis (doc 05's status dictionary). Whether a
  // carrier "delivered" should advance the order to DELIVERED is open question
  // O1 in that doc — deliberately not decided in code.
  assert.equal(order.status, "SHIPPED");
});
