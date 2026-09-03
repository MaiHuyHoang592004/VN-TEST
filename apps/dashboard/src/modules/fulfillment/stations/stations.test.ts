/**
 * The fulfillment stations, asserted against a real database.
 *
 * Integration, not unit: three of the guarantees below are DATABASE
 * behaviour — a column lock, SKIP LOCKED, and a counter guarded by its own
 * row — and a mocked client would pass with every one of them deleted.
 *
 * Two of these tests exist because a sequential version would be vacuous:
 * the basket claim and the double-scan only exercise their guards when two
 * calls genuinely overlap (the lesson doc 04 C1 recorded). If either is ever
 * "simplified" into a sequential test, the guard it protects can be removed
 * and the suite stays green.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

// Storage before the first upload: proof photos land on disk in a temp dir,
// never in a Blob store, and the suite cleans up after itself.
const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".stations-test-uploads");
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.STORAGE_DRIVER = "local";

import { prisma, type UserRole } from "@opcreative/db";
import {
  attachProof,
  completeHandoff,
  fillOrder,
  linkLabel,
  quickUpdate,
  recordScan,
  StationError,
} from "./service.ts";
import { listTrackingGroups } from "./service/monitor.ts";

let adminId: string;
let sellerId: string;
let packerId: string;
let otherPackerId: string;
let siteA: number;
let siteB: number;
let skuId: number;
let productId: number;
let variantId: number;
const basketIds: number[] = [];

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
/** A floor worker who is a member of site A ONLY. */
const packer = () => ({ id: packerId, roles: ["WAREHOUSE"] as UserRole[] });
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });

let seq = 0;
const nextTracking = () => `1Z999AA1012345${String(1000 + seq++)}`;

/**
 * A parcel: `count` orders sharing one tracking number, already ASSIGNED —
 * the state the floor receives work in.
 */
async function makeParcel(
  opts: { count?: number; quantity?: number; warehouseId?: number; withShipment?: boolean } = {},
) {
  const { count = 1, quantity = 1, warehouseId = siteA, withShipment = true } = opts;
  const tracking = nextTracking();
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const order = await prisma.order.create({
      data: {
        externalId: `ST-${tracking}-${i}`,
        customerId: sellerId,
        warehouseId,
        productId,
        variantId,
        productVariantId: skuId,
        quantity,
        placedAt: new Date(),
        status: "ASSIGNED",
        ...(withShipment ? { shipments: { create: { trackingNumber: tracking } } } : {}),
      },
      select: { id: true },
    });
    ids.push(order.id);
  }
  return { tracking, ids };
}

const statusOf = async (id: number) =>
  (await prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

const png = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "proof.png", {
    type: "image/png",
  });

before(async () => {
  const [a, s, p, p2] = await Promise.all([
    prisma.user.create({ data: { email: "st-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "st-seller@test.local", roles: ["SELLER"], name: "Station Seller" } }),
    prisma.user.create({ data: { email: "st-packer@test.local", roles: ["WAREHOUSE"] } }),
    prisma.user.create({ data: { email: "st-packer2@test.local", roles: ["WAREHOUSE"] } }),
  ]);
  adminId = a.id;
  sellerId = s.id;
  packerId = p.id;
  otherPackerId = p2.id;

  const [wa, wb] = await Promise.all([
    prisma.customer.create({ data: { code: "STA", name: "Station Site A", timezone: "UTC", status: "ACTIVE" } }),
    prisma.customer.create({ data: { code: "STB", name: "Station Site B", timezone: "UTC", status: "ACTIVE" } }),
  ]);
  siteA = wa.id;
  siteB = wb.id;
  // The packer works site A. Site B is the isolation control.
  await prisma.warehouseMember.create({ data: { warehouseId: siteA, userId: packerId } });

  const pr = await prisma.variant.create({ data: { name: "Station Wallet", key: "st-wallet", status: "ACTIVE" } });
  const va = await prisma.product.create({ data: { name: "Station Black", key: "st-black" } });
  productId = pr.id;
  variantId = va.id;
  const sku = await prisma.productVariant.create({ data: { productId: pr.id, variantId: va.id } });
  skuId = sku.id;

  for (const row of ["A", "B", "C"]) {
    const slot = await prisma.basketPosition.create({
      data: { shelfName: "ST", column: 1, row, status: "AVAILABLE" },
    });
    basketIds.push(slot.id);
  }
});

after(async () => {
  const users = [adminId, sellerId, packerId, otherPackerId];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  const orders = await prisma.order.findMany({ where: { customerId: sellerId }, select: { id: true } });
  await prisma.shipment.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await prisma.order.deleteMany({ where: { customerId: sellerId } });
  await prisma.basketPosition.deleteMany({ where: { id: { in: basketIds } } });
  await prisma.productVariant.deleteMany({ where: { id: skuId } });
  await prisma.variant.deleteMany({ where: { id: productId } });
  await prisma.product.deleteMany({ where: { id: variantId } });
  await prisma.warehouseMember.deleteMany({ where: { warehouseId: { in: [siteA, siteB] } } });
  await prisma.customer.deleteMany({ where: { id: { in: [siteA, siteB] } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await rm(UPLOAD_DIR, { recursive: true, force: true });
  await prisma.$disconnect();
});

// ── The scan ─────────────────────────────────────────────────────────────────

test("a scan starts every ASSIGNED order in the parcel, and only those", async () => {
  const { tracking, ids } = await makeParcel({ count: 3 });
  // One piece is already on hold: the scan must not drag it back into work.
  await prisma.order.update({ where: { id: ids[2] }, data: { status: "ON_HOLD" } });

  const result = await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  assert.ok(result.group, "the parcel loaded");
  assert.equal(result.group.orders.length, 3, "the whole parcel, not one piece");

  assert.equal(await statusOf(ids[0]), "IN_PRODUCTION");
  assert.equal(await statusOf(ids[1]), "IN_PRODUCTION");
  assert.equal(await statusOf(ids[2]), "ON_HOLD", "a held piece is left alone");

  // wasScanned describes the state BEFORE this scan. The two fresh rows were
  // ASSIGNED, so they report false even though they have just moved.
  const flags = new Map(result.group.orders.map((o) => [o.id, o.wasScanned]));
  assert.equal(flags.get(ids[0]), false);
  assert.equal(flags.get(ids[1]), false);
  assert.equal(flags.get(ids[2]), true, "the held piece had already been worked");

  // Re-scanning the same parcel: now everything reports as already scanned,
  // which is what raises the station's warning dialog.
  const again = await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  assert.ok(again.group!.orders.every((o) => o.wasScanned), "the second scan warns");
});

test("a scan of more than 20 orders mutates NOTHING until it is confirmed", async () => {
  // One external order split into 21 rows, no label yet — the order-id search
  // widens by externalId prefix, which is how a typo reaches hundreds of rows.
  const tracking = nextTracking();
  const ids: number[] = [];
  for (let i = 0; i < 21; i++) {
    const o = await prisma.order.create({
      data: {
        externalId: `ST-BIG-${tracking}-${i}`,
        customerId: sellerId,
        warehouseId: siteA,
        productVariantId: skuId,
        quantity: 1,
        placedAt: new Date(),
        status: "ASSIGNED",
      },
      select: { id: true },
    });
    ids.push(o.id);
  }

  const gated = await recordScan(packer(), { mode: "order", value: String(ids[0]) }, ctx(packer()));
  assert.equal(gated.requiresConfirmation?.count, 21, "it says how many it would move");
  assert.equal(gated.group, undefined, "and hands back no group to act on");
  const untouched = await prisma.order.findMany({ where: { id: { in: ids } }, select: { status: true } });
  assert.ok(untouched.every((o) => o.status === "ASSIGNED"), "not one column moved");

  const confirmed = await recordScan(
    packer(),
    { mode: "order", value: String(ids[0]), confirmed: true },
    ctx(packer()),
  );
  assert.equal(confirmed.group?.orders.length, 21);
  const moved = await prisma.order.findMany({ where: { id: { in: ids } }, select: { status: true } });
  assert.ok(moved.every((o) => o.status === "IN_PRODUCTION"), "confirmation moved all of them");
});

test("the first packer to scan owns the order — a later scan never rewrites that", async () => {
  const { tracking, ids } = await makeParcel({ count: 1 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  const first = await prisma.order.findUniqueOrThrow({
    where: { id: ids[0] },
    select: { assignedToId: true },
  });
  assert.equal(first.assignedToId, packerId, "stamped on the scan");

  // Send it back to ASSIGNED and let someone else scan it.
  await prisma.order.update({ where: { id: ids[0] }, data: { status: "ASSIGNED" } });
  const other = { id: otherPackerId, roles: ["WAREHOUSE"] as UserRole[] };
  await prisma.warehouseMember.create({ data: { warehouseId: siteA, userId: otherPackerId } });
  await recordScan(other, { mode: "tracking", value: tracking }, ctx(other));

  const after = await prisma.order.findUniqueOrThrow({
    where: { id: ids[0] },
    select: { assignedToId: true },
  });
  assert.equal(after.assignedToId, packerId, "who did the work first is history, not a latest-writer field");
});

test("a station cannot scan another site's parcel", async () => {
  const { tracking, ids } = await makeParcel({ count: 1, warehouseId: siteB });
  await assert.rejects(
    () => recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer())),
    (e: Error & { code?: string }) => e.code === "group-not-found",
    "site B is invisible to a site A packer",
  );
  assert.equal(await statusOf(ids[0]), "ASSIGNED", "and nothing moved");
});

// ── Filling and the basket ───────────────────────────────────────────────────

test("a fill cannot exceed what is left to make", async () => {
  const { tracking, ids } = await makeParcel({ count: 1, quantity: 3 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));

  await assert.rejects(
    () => fillOrder(packer(), { orderId: ids[0], amount: 4 }, ctx(packer())),
    (e: Error & { code?: string }) => e.code === "amount-exceeds-remaining",
  );

  await fillOrder(packer(), { orderId: ids[0], amount: 2 }, ctx(packer()));
  await assert.rejects(
    () => fillOrder(packer(), { orderId: ids[0], amount: 2 }, ctx(packer())),
    (e: Error & { code?: string }) => e.code === "amount-exceeds-remaining",
    "2 of 3 made leaves room for 1, not 2",
  );

  const column = await prisma.order.findUniqueOrThrow({
    where: { id: ids[0] },
    select: { filled: true, status: true },
  });
  assert.equal(column.filled, 2);
  assert.equal(column.status, "IN_PRODUCTION", "'filled' is derived, never a status of its own");
});

test("two packers filling one parcel at the same instant claim exactly ONE basket", async () => {
  // THE concurrency case. Sequential calls pass with the lock deleted; only an
  // overlap proves the group is serialised. Without it each call reads "no
  // basket yet" and takes a different slot, leaving one occupied forever.
  const { tracking, ids } = await makeParcel({ count: 2 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  const freeBefore = await prisma.basketPosition.count({ where: { status: "AVAILABLE" } });

  await Promise.all([
    fillOrder(packer(), { orderId: ids[0], amount: 1 }, ctx(packer())),
    fillOrder(packer(), { orderId: ids[1], amount: 1 }, ctx(packer())),
  ]);

  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: { basketPositionId: true, filled: true },
  });
  const slots = new Set(rows.map((r) => r.basketPositionId));
  assert.equal(slots.size, 1, "one parcel, one shelf slot");
  assert.notEqual([...slots][0], null, "and it was actually claimed");
  assert.ok(rows.every((r) => r.filled === 1), "both fills still counted");

  const freeAfter = await prisma.basketPosition.count({ where: { status: "AVAILABLE" } });
  assert.equal(freeBefore - freeAfter, 1, "exactly one slot left the pool");
});

test("a single-order parcel needs no basket at all", async () => {
  const { tracking, ids } = await makeParcel({ count: 1 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  const { basket } = await fillOrder(packer(), { orderId: ids[0], amount: 1 }, ctx(packer()));
  assert.equal(basket, null, "nothing to stage — it is already one box");
});

// ── The proof photo ──────────────────────────────────────────────────────────

test("a proof photo fulfils the parcel and frees its basket exactly once", async () => {
  const { tracking, ids } = await makeParcel({ count: 2 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  await fillOrder(packer(), { orderId: ids[0], amount: 1 }, ctx(packer()));
  await fillOrder(packer(), { orderId: ids[1], amount: 1 }, ctx(packer()));

  const held = await prisma.order.findUniqueOrThrow({
    where: { id: ids[0] },
    select: { basketPositionId: true },
  });
  assert.notEqual(held.basketPositionId, null, "staged in a slot");

  const result = await attachProof(packer(), { trackingNumber: tracking }, png(), ctx(packer()));
  assert.ok(result.group, "the photo was accepted");

  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: { status: true, proofImageUrl: true, fulfilledAt: true, configs: true, basketPositionId: true },
  });
  assert.ok(rows.every((r) => r.status === "FULFILLED"), "every piece is packed");
  assert.ok(rows.every((r) => r.proofImageUrl?.startsWith("/api/files/proofs/")), "each column carries the photo");
  assert.ok(rows.every((r) => r.fulfilledAt !== null), "and is stamped with when");
  // doc 05 §A1b R3: the storage key rides along, so a provider move never has
  // to parse a URL to find the object again.
  assert.ok(
    rows.every((r) => typeof (r.configs as { proofKey?: string } | null)?.proofKey === "string"),
    "the storage key was persisted next to the url",
  );
  assert.ok(rows.every((r) => r.basketPositionId === held.basketPositionId), "where it sat is kept as history");

  const slot = await prisma.basketPosition.findUniqueOrThrow({
    where: { id: held.basketPositionId! },
    select: { status: true, trackingNumber: true },
  });
  assert.equal(slot.status, "AVAILABLE", "but the shelf slot is free for the next parcel");
  assert.equal(slot.trackingNumber, null);
});

test("re-photographing a fulfilled parcel asks first, and changes nothing until told", async () => {
  const { tracking, ids } = await makeParcel({ count: 1 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  const first = await attachProof(packer(), { trackingNumber: tracking }, png(), ctx(packer()));
  const original = first.group!.orders[0].proofImageUrl;

  const gated = await attachProof(packer(), { trackingNumber: tracking }, png(), ctx(packer()));
  assert.equal(gated.requiresOverwrite, true, "a second photo needs a decision");
  const unchanged = await prisma.order.findUniqueOrThrow({
    where: { id: ids[0] },
    select: { proofImageUrl: true },
  });
  assert.equal(unchanged.proofImageUrl, original, "the first photo is still the evidence");

  const replaced = await attachProof(packer(), { trackingNumber: tracking }, png(), ctx(packer()), true);
  assert.notEqual(replaced.group!.orders[0].proofImageUrl, original, "with overwrite it is replaced");
  assert.equal(await statusOf(ids[0]), "FULFILLED", "and the parcel did not move backwards");
});

test("a proof photo is refused unless it is actually an image", async () => {
  const { tracking } = await makeParcel({ count: 1 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  await assert.rejects(
    () =>
      attachProof(
        packer(),
        { trackingNumber: tracking },
        new File([new Uint8Array(8)], "label.pdf", { type: "application/pdf" }),
        ctx(packer()),
      ),
    (e: Error & { code?: string }) => e.code === "not-an-image",
  );
});

// ── The handoff ──────────────────────────────────────────────────────────────

test("a handoff refuses a parcel that is not fully packed, and names the pieces", async () => {
  const { tracking, ids } = await makeParcel({ count: 2 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  // Only the first piece gets photographed — by fulfilling one order directly.
  await prisma.order.update({ where: { id: ids[0] }, data: { status: "FULFILLED" } });

  const err = (await completeHandoff(
    packer(),
    { trackingNumber: tracking, confirmText: "completed" },
    ctx(packer()),
  ).catch((e) => e)) as StationError;
  assert.equal(err.code, "not-ready");
  assert.deepEqual(
    (err.detail as Array<{ id: number }>).map((d) => d.id),
    [ids[1]],
    "it says WHICH piece is holding the parcel up",
  );
  assert.equal(await statusOf(ids[0]), "FULFILLED", "and nothing shipped");
});

test("the typed check is the gate — a wrong word ships nothing", async () => {
  const { tracking, ids } = await makeParcel({ count: 1 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  await attachProof(packer(), { trackingNumber: tracking }, png(), ctx(packer()));

  await assert.rejects(
    () => completeHandoff(packer(), { trackingNumber: tracking, confirmText: "complete" }, ctx(packer())),
    (e: Error & { code?: string }) => e.code === "check-failed",
  );
  assert.equal(await statusOf(ids[0]), "FULFILLED", "still on the bench");

  // Case does not matter; the deliberate pause does.
  const done = await completeHandoff(
    packer(),
    { trackingNumber: tracking, confirmText: "COMPLETED" },
    ctx(packer()),
  );
  assert.equal(await statusOf(ids[0]), "SHIPPED");
  assert.equal(done.group.orders.length, 1);
});

test("a shipped parcel always has a shipment, and the seller was told", async () => {
  const { tracking, ids } = await makeParcel({ count: 2 });
  await recordScan(packer(), { mode: "tracking", value: tracking }, ctx(packer()));
  await fillOrder(packer(), { orderId: ids[0], amount: 1 }, ctx(packer()));
  await attachProof(packer(), { trackingNumber: tracking }, png(), ctx(packer()));
  const basketId = (
    await prisma.order.findUniqueOrThrow({ where: { id: ids[0] }, select: { basketPositionId: true } })
  ).basketPositionId;

  await completeHandoff(packer(), { trackingNumber: tracking, confirmText: "completed" }, ctx(packer()));

  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: { status: true, shipments: { select: { shippedAt: true, trackingNumber: true } } },
  });
  assert.ok(rows.every((r) => r.status === "SHIPPED"));
  assert.ok(
    rows.every((r) => r.shipments.length > 0 && r.shipments[0].shippedAt !== null),
    "SHIPPED never exists without a shipment recording where it went",
  );

  const slot = await prisma.basketPosition.findUniqueOrThrow({
    where: { id: basketId! },
    select: { status: true },
  });
  assert.equal(slot.status, "AVAILABLE");

  const told = await prisma.notification.findMany({
    where: { userId: sellerId, type: "ORDER_STATUS_CHANGED" },
  });
  assert.ok(
    told.some((n) => (n.data as { status?: string } | null)?.status === "SHIPPED"),
    "the seller's bell rang when their parcel left",
  );
});

test("a handoff creates the missing shipment rather than shipping into the void", async () => {
  // A parcel worked without a label: the handoff still has to record where it
  // went, or support has nothing to answer a warehouse with.
  const { ids } = await makeParcel({ count: 1, withShipment: false });
  await recordScan(packer(), { mode: "order", value: String(ids[0]) }, ctx(packer()));
  await attachProof(packer(), { orderId: ids[0] }, png(), ctx(packer()));

  // The station knows the parcel by the order it scanned; the worker supplies
  // the number now printed on the box.
  const invented = "9400100000000000000001";
  await completeHandoff(
    packer(),
    { orderId: ids[0], trackingNumber: invented, confirmText: "completed" },
    ctx(packer()),
  );

  const column = await prisma.order.findUniqueOrThrow({
    where: { id: ids[0] },
    select: { status: true, shipments: { select: { trackingNumber: true, shippedAt: true } } },
  });
  assert.equal(column.status, "SHIPPED");
  assert.equal(column.shipments[0]?.trackingNumber, invented);
  assert.notEqual(column.shipments[0]?.shippedAt, null);
});

// ── Quick scan ───────────────────────────────────────────────────────────────

test("quick update moves what it legally can and NAMES what it skipped", async () => {
  const { tracking, ids } = await makeParcel({ count: 2 });
  // One piece is already delivered — a terminal status nothing moves out of.
  await prisma.order.update({ where: { id: ids[1] }, data: { status: "DELIVERED" } });

  const result = await quickUpdate(
    packer(),
    { keyword: tracking, to: "IN_PRODUCTION", note: "back on the bench" },
    ctx(packer()),
  );

  assert.equal(result.updated, 1);
  assert.deepEqual(
    result.skipped.map((s) => ({ id: s.id, reason: s.reason })),
    [{ id: ids[1], reason: "invalid-transition" }],
    "legacy reported this column as updated; naming it is the fix",
  );
  assert.equal(await statusOf(ids[0]), "IN_PRODUCTION");
  assert.equal(await statusOf(ids[1]), "DELIVERED", "the terminal column is untouched");
});

test("quick update cannot reach another site's orders", async () => {
  const { tracking, ids } = await makeParcel({ count: 1, warehouseId: siteB });
  await assert.rejects(
    () => quickUpdate(packer(), { keyword: tracking, to: "CANCELLED" }, ctx(packer())),
    (e: Error & { code?: string }) => e.code === "group-not-found",
  );
  assert.equal(await statusOf(ids[0]), "ASSIGNED");
});

// ── Labels ───────────────────────────────────────────────────────────────────

test("linking a label outside the actor's scope links nothing", async () => {
  const { ids } = await makeParcel({ count: 1, warehouseId: siteB, withShipment: false });
  const result = await linkLabel(
    packer(),
    { orderIds: ids, trackingNumber: "9400100000000000000002", labelUrl: "https://example.com/l.pdf" },
    ctx(packer()),
  );
  assert.equal(result.linked, 0, "an id from a client is not authorization");
  assert.equal(result.skipped, 1);
  const shipments = await prisma.shipment.count({ where: { orderId: { in: ids } } });
  assert.equal(shipments, 0, "and no shipment column was invented for it");
});

test("a linked label lands on every order of the parcel", async () => {
  const { ids } = await makeParcel({ count: 2, withShipment: false });
  const tracking = nextTracking();
  const result = await linkLabel(
    admin(),
    {
      orderIds: ids,
      trackingNumber: tracking,
      labelUrl: "https://example.com/label.pdf",
      provider: "pirateship",
      cost: "4.50",
    },
    ctx(admin()),
  );
  assert.equal(result.linked, 2);

  const shipments = await prisma.shipment.findMany({
    where: { orderId: { in: ids } },
    select: { trackingNumber: true, labelUrl: true, cost: true, provider: true },
  });
  assert.equal(shipments.length, 2, "one shipment column per order — a group shares the number, not the column");
  assert.ok(shipments.every((s) => s.trackingNumber === tracking));
  assert.equal(shipments[0].cost?.toFixed(2), "4.50", "money survives as an exact decimal");

  // And the parcel is now findable by the number that was just attached.
  const found = await recordScan(admin(), { mode: "tracking", value: tracking }, ctx(admin()));
  assert.equal(found.group?.orders.length, 2);
});

// ── The monitor ──────────────────────────────────────────────────────────────

test("the monitor counts GROUPS, not rows, and pages by group", async () => {
  // Legacy's monitor paginated on the order count while displaying groups, so
  // its "next page" skipped parcels. One page of one, walked with the cursor.
  const first = await listTrackingGroups(packer(), { limit: 1 });
  assert.equal(first.groups.length, 1, "a page of one group");
  assert.notEqual(first.nextCursor, null, "and there is more");
  assert.ok(first.groups[0].orderCount >= 1);
  assert.equal(
    first.groups[0].totalQuantity >= first.groups[0].totalFilled,
    true,
    "progress cannot exceed the work",
  );

  const second = await listTrackingGroups(packer(), { limit: 1, cursor: first.nextCursor! });
  assert.notEqual(second.groups[0]?.key, first.groups[0].key, "the cursor moved past the first parcel");

  // Site B's parcels are not this packer's business, on this page either.
  const all = await listTrackingGroups(packer(), { limit: 200 });
  const siteBOrders = await prisma.order.findMany({
    where: { warehouseId: siteB },
    select: { externalId: true },
  });
  const visible = new Set(all.groups.map((g) => g.key));
  for (const o of siteBOrders) {
    assert.ok(!visible.has(o.externalId ?? ""), "another site's parcel never appears");
  }
});

test("the monitor's filters split work in flight from work that is ready", async () => {
  const ready = await listTrackingGroups(admin(), { filter: "ready", limit: 200 });
  assert.ok(
    ready.groups.every((g) => g.statuses.every((s) => s === "FULFILLED")),
    "'ready' means every piece is packed",
  );
  const open = await listTrackingGroups(admin(), { filter: "open", limit: 200 });
  assert.ok(
    open.groups.every((g) => g.statuses.some((s) => ["PENDING", "ASSIGNED", "IN_PRODUCTION", "ON_HOLD"].includes(s))),
    "'open' means something still needs doing",
  );
});
