/**
 * The company's own books, against a real database.
 *
 * What is actually worth pinning here:
 *   · the tiles are computed over the WHOLE filter, not the page on screen —
 *     the legacy bug, and one that only shows up past page one;
 *   · a category with entries cannot be deleted, or last year's report loses
 *     its labels;
 *   · a vendor something points at is DEACTIVATED, never deleted;
 *   · VND-n numbering continues rather than restarting.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";

import { createVendor, deleteVendor, listVendors } from "../vendors/service.ts";
import {
  createCategory,
  createEntry,
  deleteCategory,
  deleteEntry,
  listEntries,
  ExpenseError,
} from "./service.ts";

let adminId: string;
let inkCategory: number;
let salesCategory: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[], email: "exp-admin@test.local" });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

/** Every test here filters on its own category, so one file's rows cannot
 * change another's totals. */
const summaryOf = async (categoryId: number) =>
  (await listEntries(admin(), { categoryId })).summary;

before(async () => {
  const user = await prisma.user.create({
    data: { email: "exp-admin@test.local", roles: ["ADMIN"] },
  });
  adminId = user.id;

  inkCategory = (await createCategory(admin(), { name: "Ink", type: "EXPENSE" }, ctx())).id;
  salesCategory = (await createCategory(admin(), { name: "Scrap sales", type: "INCOME" }, ctx())).id;
});

// ── Totals ───────────────────────────────────────────────────────────────────

test("the tiles cover the whole filter, not the page on screen", async () => {
  // Thirty entries of 10.00, then ask for a page of five. A page-sum would
  // report 50.00; the groupBy reports the truth.
  for (let i = 0; i < 30; i++) {
    await createEntry(
      admin(),
      {
        categoryId: inkCategory,
        type: "EXPENSE",
        amount: "10.00",
        occurredAt: "2026-03-01",
      },
      ctx(),
    );
  }

  const page = await listEntries(admin(), { categoryId: inkCategory, pageSize: 5 });
  assert.equal(page.rows.length, 5, "the page is a page");
  assert.equal(page.total, 30);
  assert.equal(page.summary.expense, "300.00", "the tile is the whole filter");
  assert.equal(page.summary.net, "-300.00", "expense-only means a negative net");
});

test("income and expense are summed apart, and net is the difference", async () => {
  await createEntry(
    admin(),
    { categoryId: salesCategory, type: "INCOME", amount: "125.50", occurredAt: "2026-03-02" },
    ctx(),
  );
  await createEntry(
    admin(),
    // Filed under an INCOME category but recorded as an expense — the case the
    // per-entry type exists for.
    { categoryId: salesCategory, type: "EXPENSE", amount: "25.50", occurredAt: "2026-03-03" },
    ctx(),
  );

  const summary = await summaryOf(salesCategory);
  assert.equal(summary.income, "125.50");
  assert.equal(summary.expense, "25.50");
  assert.equal(summary.net, "100.00");
});

test("the date filter is inclusive of the whole end day", async () => {
  const category = (await createCategory(admin(), { name: "Rent", type: "EXPENSE" }, ctx())).id;
  await createEntry(
    admin(),
    { categoryId: category, type: "EXPENSE", amount: "900.00", occurredAt: "2026-04-30" },
    ctx(),
  );

  // An exclusive end date would silently drop the last day of a month — the
  // filter people reach for most.
  const inRange = await listEntries(admin(), { categoryId: category, from: "2026-04-01", to: "2026-04-30" });
  assert.equal(inRange.total, 1);
  assert.equal(inRange.summary.expense, "900.00");

  const outOfRange = await listEntries(admin(), { categoryId: category, from: "2026-05-01" });
  assert.equal(outOfRange.total, 0);
  assert.equal(outOfRange.summary.net, "0.00");
});

test("a deleted entry leaves the totals", async () => {
  const category = (await createCategory(admin(), { name: "Postage", type: "EXPENSE" }, ctx())).id;
  const entry = await createEntry(
    admin(),
    { categoryId: category, type: "EXPENSE", amount: "40.00", occurredAt: "2026-04-02" },
    ctx(),
  );
  assert.equal((await summaryOf(category)).expense, "40.00");

  await deleteEntry(admin(), entry.id, ctx());
  assert.equal((await summaryOf(category)).expense, "0.00", "a removed line stops counting");
  assert.equal(
    await prisma.expenseEntry.count({ where: { id: entry.id } }),
    1,
    "but the column is still there — soft delete, so an audit can still explain it",
  );
});

// ── Categories ───────────────────────────────────────────────────────────────

test("a category with entries cannot be deleted", async () => {
  await assert.rejects(
    () => deleteCategory(admin(), inkCategory, ctx()),
    (e) => e instanceof ExpenseError && codeOf(e) === "category-in-use",
  );

  const empty = (await createCategory(admin(), { name: "Unused", type: "EXPENSE" }, ctx())).id;
  const gone = await deleteCategory(admin(), empty, ctx());
  assert.equal(gone.ok, true, "an empty one is just a typo to remove");
});

// ── Vendors ──────────────────────────────────────────────────────────────────

test("a blank code becomes VND-n, and n keeps counting", async () => {
  const first = await createVendor(admin(), { name: "Paper Co", status: "ACTIVE" }, ctx());
  const second = await createVendor(admin(), { name: "Ink Co", status: "ACTIVE" }, ctx());
  assert.ok(first.ok && second.ok);
  assert.match(first.code as string, /^VND-\d+$/);
  assert.equal(
    Number((second.code as string).slice(4)),
    Number((first.code as string).slice(4)) + 1,
    "the next one continues rather than restarting",
  );
});

test("a vendor an expense points at is DEACTIVATED, never deleted", async () => {
  const vendor = await createVendor(admin(), { name: "Boxes Ltd", status: "ACTIVE" }, ctx());
  assert.ok(vendor.ok);
  await createEntry(
    admin(),
    {
      categoryId: inkCategory,
      type: "EXPENSE",
      amount: "5.00",
      occurredAt: "2026-04-04",
      vendorId: vendor.id,
    },
    ctx(),
  );

  const result = await deleteVendor(admin(), vendor.id, ctx());
  assert.equal(result.deactivated, true, "history has to keep resolving");
  const column = await prisma.vendor.findUniqueOrThrow({
    where: { id: vendor.id },
    select: { status: true, deletedAt: true },
  });
  assert.equal(column.status, "INACTIVE");
  assert.equal(column.deletedAt, null, "still resolvable from the expense that points at it");

  // An unreferenced one really goes.
  const unused = await createVendor(admin(), { name: "Never Used", status: "ACTIVE" }, ctx());
  assert.ok(unused.ok);
  const removed = await deleteVendor(admin(), unused.id, ctx());
  assert.equal(removed.deactivated, false);
  assert.notEqual(
    (await prisma.vendor.findUniqueOrThrow({ where: { id: unused.id }, select: { deletedAt: true } }))
      .deletedAt,
    null,
  );
});

test("a duplicate code is refused, not silently renamed", async () => {
  const first = await createVendor(admin(), { code: "DUP-1", name: "First", status: "ACTIVE" }, ctx());
  assert.ok(first.ok);
  const second = await createVendor(admin(), { code: "dup-1", name: "Second", status: "ACTIVE" }, ctx());
  assert.equal(second.ok, false, "codes are uppercased, so these are the same code");
  assert.equal(codeOf({ code: second.ok ? null : second.error }), "code-taken");
});

test("the vendor tiles count the table, not the page", async () => {
  const listed = await listVendors(admin(), { pageSize: 1 });
  assert.equal(listed.rows.length, 1);
  assert.ok(listed.tiles.total >= 4, "every vendor this file made is counted");
  assert.equal(
    listed.tiles.total,
    listed.tiles.active + listed.tiles.inactive,
    "active + inactive is the whole live table",
  );
});
