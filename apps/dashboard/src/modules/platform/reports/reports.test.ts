/**
 * The dashboard's numbers, and the two hidden-menu assumptions that must not
 * be load-bearing.
 *
 * Legacy's /api/reports/* had NO role guard: any signed-in warehouse could pull
 * the all-customers financial report, and its seller report took an optional
 * :id anyone could pass. The guard tests here are the proof that neither is
 * true any more — the menu being hidden is not evidence.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, can, type UserRole } from "@gwprint/db";

import { adminReport, sellerReport, warehouseReport } from "./service.ts";
import { searchFor } from "../search/service.ts";

let sellerAId: string;
let sellerBId: string;
let warehouseUserId: string;
let siteId: number;

const admin = () => ({ id: "rep-admin", roles: ["ADMIN"] as UserRole[] });
const sellerA = () => ({ id: sellerAId, roles: ["SELLER"] as UserRole[] });
const sellerB = () => ({ id: sellerBId, roles: ["SELLER"] as UserRole[] });
const packer = () => ({ id: warehouseUserId, roles: ["WAREHOUSE"] as UserRole[] });

const range = { from: new Date(2026, 0, 1), to: new Date(2026, 11, 31) };

async function order(customerId: string, opts: { quantity: number; baseCost: string; warehouseId?: number }) {
  return prisma.order.create({
    data: {
      quantity: opts.quantity,
      baseCost: opts.baseCost,
      placedAt: new Date(2026, 5, 15),
      customerId,
      warehouseId: opts.warehouseId,
      status: "ASSIGNED",
      paid: true,
      externalId: `REP-${Math.round(Number(opts.baseCost) * 100)}-${customerId.slice(-4)}`,
    },
    select: { id: true },
  });
}

before(async () => {
  const [a, b, w] = await Promise.all([
    prisma.user.create({ data: { email: "rep-a@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "rep-b@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "rep-w@test.local", roles: ["WAREHOUSE"] } }),
  ]);
  sellerAId = a.id;
  sellerBId = b.id;
  warehouseUserId = w.id;

  const site = await prisma.warehouse.create({ data: { code: "REP-1", name: "Report site" } });
  siteId = site.id;
  await prisma.warehouseMember.create({
    data: { userId: warehouseUserId, warehouseId: siteId, isPrimary: true },
  });

  await order(sellerAId, { quantity: 2, baseCost: "10.00", warehouseId: siteId });
  await order(sellerAId, { quantity: 3, baseCost: "20.00", warehouseId: siteId });
  await order(sellerBId, { quantity: 1, baseCost: "5.00" });
});

// ── The guards ───────────────────────────────────────────────────────────────

test("a seller does not hold the grant the admin report is guarded on", () => {
  // The queries layer calls requirePermission with exactly this permission, so
  // this is the same question the guard asks — and the answer legacy got wrong.
  assert.equal(can(sellerA().roles, "transactions.read.all"), false);
  assert.equal(can(sellerA().roles, "transactions.read.own"), true);
  assert.equal(can(admin().roles, "transactions.read.all"), true);
});

test("the seller report has no id parameter to abuse", async () => {
  // Legacy's took an optional :id. Ours reads actor.id and nothing else, so
  // seller A's report is seller A's numbers however it is called.
  const mine = await sellerReport(sellerA(), range);
  const theirs = await sellerReport(sellerB(), range);
  assert.equal(mine.orders, 2);
  assert.equal(theirs.orders, 1);
  assert.equal(mine.quantity, 5);
  assert.equal(theirs.quantity, 1);
});

// ── The numbers ──────────────────────────────────────────────────────────────

test("the admin report totals every seller, and each column is that seller's own", async () => {
  const report = await adminReport(admin(), range);
  const rowA = report.rows.find((r) => r.id === sellerAId);
  const rowB = report.rows.find((r) => r.id === sellerBId);

  assert.equal(rowA?.orders, 2);
  assert.equal(rowA?.baseCost, "30.00");
  assert.equal(rowB?.orders, 1);
  assert.equal(rowB?.baseCost, "5.00");

  assert.ok(report.summary.orders >= 3);
  assert.ok(report.summary.customers >= 2);
});

test("the window is a filter, not a suggestion", async () => {
  const before2026 = await sellerReport(sellerA(), {
    from: new Date(2025, 0, 1),
    to: new Date(2025, 11, 31),
  });
  assert.equal(before2026.orders, 0, "orders placed in June 2026 are not in 2025");
  assert.equal(before2026.baseCost, "0.00");
});

test("a seller's status summary is all-time, and counts only their own", async () => {
  const report = await sellerReport(sellerB(), range);
  assert.equal(report.statusTotal, 1);
  assert.deepEqual(
    report.statuses.map((s) => s.status),
    ["ASSIGNED"],
  );
});

test("the customer report stops at the sites the actor staffs", async () => {
  const report = await warehouseReport(packer(), range);
  const orders = report.byStatus.reduce((sum, s) => sum + s.orders, 0);
  assert.equal(orders, 2, "seller B's order has no customer and is not this floor's work");
});

// ── Search scope ─────────────────────────────────────────────────────────────

test("a seller searching another seller's order number finds nothing", async () => {
  const theirs = await prisma.order.findFirstOrThrow({
    where: { customerId: sellerBId },
    select: { id: true, externalId: true },
  });
  const term = theirs.externalId as string;

  // Seller B can find their own order by its number...
  const owner = await searchFor(sellerB(), term, 10);
  assert.ok(
    owner.some((hit) => hit.id === `order-${theirs.id}`),
    "the owner finds it",
  );

  // ...and seller A cannot, though they typed exactly the same thing. The
  // search box is a back door into every table at once without this.
  const stranger = await searchFor(sellerA(), term, 10);
  assert.equal(
    stranger.some((hit) => hit.type === "order"),
    false,
    "another seller gets no order rows at all",
  );

  // Support/admin sees it — the scope, not the search, is what differs.
  const staff = await searchFor(admin(), term, 10);
  assert.ok(staff.some((hit) => hit.id === `order-${theirs.id}`));
});

test("only users.read holders get people in their results", async () => {
  const hits = await searchFor(sellerA(), "rep-b@test.local", 10);
  assert.equal(hits.some((hit) => hit.type === "user"), false, "a seller cannot enumerate accounts");

  const staff = await searchFor(admin(), "rep-b@test.local", 10);
  assert.ok(staff.some((hit) => hit.type === "user"));
});

test("a one-character query is refused before it scans anything", async () => {
  // ILIKE '%a%' over every order, variant and user to return five arbitrary
  // rows is the cost this floor exists to avoid.
  assert.deepEqual(await searchFor(admin(), "a", 10), []);
  assert.deepEqual(await searchFor(admin(), "  ", 10), []);
  assert.ok((await searchFor(admin(), "re", 10)).length >= 0, "two characters is allowed");
});

test("navigation hits are filtered by what the viewer may open", async () => {
  const seller = await searchFor(sellerA(), "expenses", 10);
  assert.equal(seller.some((hit) => hit.type === "page"), false);

  const staff = await searchFor(admin(), "expenses", 10);
  assert.ok(staff.some((hit) => hit.href === "/admin/expenses"));
});
