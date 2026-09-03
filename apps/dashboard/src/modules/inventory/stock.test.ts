/**
 * Stock invariants. These run against a real database on purpose: every rule
 * below is enforced by a WHERE clause or a transaction boundary, and a mocked
 * client would pass just as happily with both deleted.
 *
 * The four that matter:
 *   · a count never goes below zero, even under two concurrent writers
 *   · a count is never written without its movement column, and both roll back
 *     together
 *   · a manual change without its reason/note is refused before any write
 *   · a customer user cannot touch another site, however the id arrives
 *
 * Run: npm run test:money -w @opcreative/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@opcreative/db";

import { availableOf } from "./stock/counters.ts";
import { adjustStock, quickImport, listStock, listMovements } from "./stock/service.ts";

let adminId: string;
let packerId: string;
let siteA: number;
let siteB: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
/** A customer user who is a member of site A only. */
const packer = () => ({ id: packerId, roles: ["WAREHOUSE_ADMIN"] as UserRole[] });
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });

const codeOf = (e: unknown) => (e as { code?: string }).code;

/** A fresh material, so each test starts from a known zero. */
async function newMaterial(sku: string) {
  const m = await prisma.material.create({ data: { sku, name: `Material ${sku}` } });
  return m.id;
}

const stockOf = (mId: number, warehouseId: number) =>
  prisma.materialStock.findUnique({
    where: { warehouseId_materialId: { warehouseId, materialId: mId } },
    select: { quantity: true, reserved: true, needed: true },
  });

const movementsOf = (mId: number) =>
  prisma.inventoryMovement.findMany({
    where: { materialId: mId },
    select: { type: true, quantity: true, note: true },
    orderBy: { id: "asc" },
  });

before(async () => {
  const [a, p] = await Promise.all([
    prisma.user.create({ data: { email: "stock-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "stock-packer@test.local", roles: ["WAREHOUSE_ADMIN"] } }),
  ]);
  adminId = a.id;
  packerId = p.id;

  const [wa, wb] = await Promise.all([
    prisma.customer.create({ data: { code: "STK-A", name: "Site A" } }),
    prisma.customer.create({ data: { code: "STK-B", name: "Site B" } }),
  ]);
  siteA = wa.id;
  siteB = wb.id;

  // The packer belongs to site A and nowhere else.
  await prisma.warehouseMember.create({
    data: { userId: packerId, warehouseId: siteA, isPrimary: true },
  });

});

// ── The formula ──────────────────────────────────────────────────────────────

test("availableOf never returns a negative number", () => {
  // `needed` is a backlog, not a claim on real units, so over-subtracting is
  // normal. A negative here would render as nonsense AND sail through a
  // `>= required` guard as a number, which is the dangerous half.
  assert.equal(availableOf({ quantity: 10, reserved: 3, needed: 2 }), 5);
  assert.equal(availableOf({ quantity: 1, reserved: 0, needed: 99 }), 0);
  assert.equal(availableOf({ quantity: 0, reserved: 0, needed: 0 }), 0);
});

// ── Adjustments ──────────────────────────────────────────────────────────────

test("an adjustment writes the count, the movement and the audit together", async () => {
  const id = await newMaterial("STK-TOGETHER");
  await adjustStock(
    admin(),
    { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: 12, reason: "Opening count" },
    ctx(admin()),
  );

  assert.equal((await stockOf(id, siteA))?.quantity, 12);

  const moves = await movementsOf(id);
  assert.equal(moves.length, 1, "exactly one movement, not two and not none");
  assert.equal(moves[0]!.type, "MANUAL_ADJUSTMENT");
  assert.equal(moves[0]!.quantity, 12);
  assert.equal(moves[0]!.note, "Opening count", "the reason is what the ledger shows");

  const audits = await prisma.auditLog.count({
    where: { action: "STOCK_ADJUSTED", targetId: `MATERIAL:${id}@${siteA}` },
  });
  assert.equal(audits, 1);
});

test("a refused adjustment leaves NOTHING behind — count, movement or audit", async () => {
  const id = await newMaterial("STK-ROLLBACK");
  await adjustStock(
    admin(),
    { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: 3, reason: "Seed" },
    ctx(admin()),
  );

  await assert.rejects(
    () =>
      adjustStock(
        admin(),
        { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: -10, reason: "Too many" },
        ctx(admin()),
      ),
    (e: Error) => codeOf(e) === "below-zero",
    "cannot reduce inventory below zero",
  );

  assert.equal((await stockOf(id, siteA))?.quantity, 3, "the count is untouched");
  assert.equal((await movementsOf(id)).length, 1, "and no movement was left half-written");
});

test("adjusting down to exactly zero is allowed; one more is not", async () => {
  const id = await newMaterial("STK-EDGE");
  await adjustStock(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: 5, reason: "Seed" }, ctx(admin()));

  await adjustStock(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: -5, reason: "Scrapped" }, ctx(admin()));
  assert.equal((await stockOf(id, siteA))?.quantity, 0);

  await assert.rejects(
    () => adjustStock(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: -1, reason: "One more" }, ctx(admin())),
    (e: Error) => codeOf(e) === "below-zero",
  );
});

test("two concurrent reductions cannot both win", async () => {
  // The guard lives in the UPDATE's WHERE, not in a read-then-write, and this
  // is the only test that can tell the difference: sequentially both orderings
  // pass. With 6 on hand, two withdrawals of 4 must leave exactly 2.
  const id = await newMaterial("STK-RACE");
  await adjustStock(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: 6, reason: "Seed" }, ctx(admin()));

  const withdraw = () =>
    adjustStock(
      admin(),
      { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: -4, reason: "Race" },
      ctx(admin()),
    );
  const results = await Promise.allSettled([withdraw(), withdraw()]);

  const won = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(won, 1, "exactly one withdrawal succeeded");
  assert.equal((await stockOf(id, siteA))?.quantity, 2, "and the count is never negative");
});

test("an adjustment with no reason is refused before any write", async () => {
  const id = await newMaterial("STK-NOREASON");
  await assert.rejects(() =>
    adjustStock(
      admin(),
      { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: 5, reason: "  " },
      ctx(admin()),
    ),
  );
  assert.equal(await stockOf(id, siteA), null, "no column was created");
});

test("a zero adjustment is refused — it is a mis-click, not a correction", async () => {
  const id = await newMaterial("STK-ZERO");
  await assert.rejects(() =>
    adjustStock(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: 0, reason: "Nothing" }, ctx(admin())),
  );
  assert.equal((await movementsOf(id)).length, 0);
});

// ── Quick import ─────────────────────────────────────────────────────────────

test("quick import without a note is refused", async () => {
  const id = await newMaterial("STK-IMPORT-NONOTE");
  await assert.rejects(() =>
    quickImport(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantity: 10, note: "" }, ctx(admin())),
  );
  assert.equal(await stockOf(id, siteA), null);
});

test("quick import books stock in and is the history — no second table", async () => {
  const id = await newMaterial("STK-IMPORT");
  await quickImport(
    admin(),
    { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantity: 40, note: "Walk-in delivery", provider: "Acme" },
    ctx(admin()),
  );

  assert.equal((await stockOf(id, siteA))?.quantity, 40);
  const imports = await prisma.inventoryMovement.findMany({
    where: { materialId: id, type: "MANUAL_IMPORT" },
    select: { quantity: true, note: true, referenceId: true },
  });
  assert.deepEqual(imports, [{ quantity: 40, note: "Walk-in delivery", referenceId: "Acme" }]);
});

// ── The shortage backlog ─────────────────────────────────────────────────────

test("a shortage settles itself when stock arrives", async () => {
  const id = await newMaterial("STK-NEEDED");
  await prisma.materialStock.create({
    data: { warehouseId: siteA, materialId: id, quantity: 0, needed: 5 },
  });

  // Not enough yet: three units against a backlog of five settles three, and
  // the remaining shortage is still real.
  await quickImport(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantity: 3, note: "Part load" }, ctx(admin()));
  let column = await stockOf(id, siteA);
  assert.equal(column?.needed, 2, "settled what arrived, no more");
  assert.equal(availableOf(column!), 1);

  // The rest lands: the backlog clears and availability is the whole shelf.
  await quickImport(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantity: 5, note: "Rest" }, ctx(admin()));
  column = await stockOf(id, siteA);
  assert.equal(column?.needed, 0, "the tile stops being red without anyone clicking");
  assert.equal(availableOf(column!), 8);

  const settled = await prisma.inventoryMovement.findMany({
    where: { materialId: id, type: "NEEDED_RESOLVED" },
    select: { quantity: true },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(settled.map((s) => s.quantity), [3, 2], "and the ledger says how it healed");
});

test("reserved units cannot settle a shortage", async () => {
  // The backlog is cleared by units that are free, not by units already
  // promised to someone else — otherwise one order's stock silently pays off
  // another order's shortage.
  const id = await newMaterial("STK-NEEDED-RESERVED");
  await prisma.materialStock.create({
    data: { warehouseId: siteA, materialId: id, quantity: 0, reserved: 0, needed: 4 },
  });
  await quickImport(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantity: 4, note: "In" }, ctx(admin()));
  await prisma.materialStock.update({
    where: { warehouseId_materialId: { warehouseId: siteA, materialId: id } },
    data: { needed: 4, reserved: 4 },
  });

  await quickImport(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantity: 1, note: "One more" }, ctx(admin()));
  const column = await stockOf(id, siteA);
  assert.equal(column?.needed, 3, "only the one unreserved unit settled anything");
});

// ── Site scoping ─────────────────────────────────────────────────────────────

test("a customer user cannot adjust another site, however the id arrives", async () => {
  const id = await newMaterial("STK-SCOPE");
  await assert.rejects(
    () =>
      adjustStock(
        packer(),
        { itemType: "MATERIAL", itemId: id, warehouseId: siteB, quantityDelta: 100, reason: "Not mine" },
        ctx(packer()),
      ),
    (e: Error) => codeOf(e) === "customer-not-allowed",
    "an id posted from a client is not authorization",
  );
  assert.equal(await stockOf(id, siteB), null);

  // Their own site still works, so this is scoping and not a broken guard.
  const ok = await adjustStock(
    packer(),
    { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: 7, reason: "Mine" },
    ctx(packer()),
  );
  assert.equal(ok.ok, true);
});

test("a customer user's stock list and ledger stop at their own sites", async () => {
  const id = await newMaterial("STK-VISIBLE");
  await adjustStock(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteB, quantityDelta: 50, reason: "Site B only" }, ctx(admin()));

  const mine = await listStock(packer(), { itemType: "MATERIAL", search: "STK-VISIBLE" });
  assert.equal(mine.rows.length, 1, "the item is still listed…");
  assert.equal(mine.rows[0]!.onHand, 0, "…but site B's 50 are not the packer's to see");
  assert.equal(mine.totals.quantity, 0, "and the tiles agree with the rows");

  const theirs = await listStock(admin(), { itemType: "MATERIAL", search: "STK-VISIBLE" });
  assert.equal(theirs.rows[0]!.onHand, 50);

  const ledger = await listMovements(packer(), { search: "STK-VISIBLE" });
  assert.equal(ledger.rows.length, 0, "nor in the ledger");
});

test("asking for a site you cannot see returns nothing, not everything", async () => {
  // The failure mode worth guarding: a filter the scope rejects must narrow to
  // empty, never fall through to an unfiltered query.
  const list = await listStock(packer(), { itemType: "MATERIAL", warehouseId: siteB });
  assert.equal(list.totals.quantity, 0);
  assert.equal(list.rows.every((r) => r.onHand === 0), true);
});

// ── Tiles and paging ─────────────────────────────────────────────────────────

test("tile totals cover the whole filter, not the page on screen", async () => {
  // The legacy page summed the rows it had rendered, so the headline numbers
  // were wrong the moment a filter matched more than one page — quietly wrong,
  // which is worse than blank.
  const ids = await Promise.all([1, 2, 3].map((n) => newMaterial(`STK-PAGED-${n}`)));
  for (const id of ids) {
    await adjustStock(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: 10, reason: "Seed" }, ctx(admin()));
  }

  const firstPage = await listStock(admin(), { itemType: "MATERIAL", search: "STK-PAGED", pageSize: 2 });
  assert.equal(firstPage.rows.length, 2, "the page is short…");
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.totals.quantity, 30, "…and the tile still counts all three");
});

test("the ledger pages by cursor and never repeats a column", async () => {
  const id = await newMaterial("STK-CURSOR");
  for (const n of [1, 2, 3, 4, 5]) {
    await adjustStock(admin(), { itemType: "MATERIAL", itemId: id, warehouseId: siteA, quantityDelta: n, reason: `Step ${n}` }, ctx(admin()));
  }

  const first = await listMovements(admin(), { search: "STK-CURSOR", limit: 2 });
  assert.equal(first.rows.length, 2);
  assert.notEqual(first.nextCursor, null);

  const second = await listMovements(admin(), { search: "STK-CURSOR", limit: 2, cursor: first.nextCursor! });
  assert.equal(second.rows.length, 2);
  const overlap = first.rows.filter((r) => second.rows.some((s) => s.id === r.id));
  assert.equal(overlap.length, 0, "a cursor page cannot re-serve a column it already sent");
});

// ── Finished goods take the same path ────────────────────────────────────────

test("a finished SKU adjusts through exactly the same code as a material", async () => {
  // The point of the itemType discriminator: if this needed its own service,
  // the two would drift apart the way legacy's did.
  const product = await prisma.productVariant.create({
    data: {
      sku: "STK-SKU-1",
      variant: { create: { name: "Stock variant", key: "stock-variant" } },
      product: { create: { name: "Stock product", key: "stock-product" } },
    },
  });

  await adjustStock(
    admin(),
    { itemType: "PRODUCT", itemId: product.id, warehouseId: siteA, quantityDelta: 9, reason: "Finished goods" },
    ctx(admin()),
  );

  const column = await prisma.warehouseInventory.findUnique({
    where: { warehouseId_productVariantId: { warehouseId: siteA, productVariantId: product.id } },
    select: { quantity: true },
  });
  assert.equal(column?.quantity, 9);

  const moves = await prisma.inventoryMovement.count({
    where: { productVariantId: product.id, type: "MANUAL_ADJUSTMENT" },
  });
  assert.equal(moves, 1);

  const list = await listStock(admin(), { itemType: "PRODUCT", search: "STK-SKU-1" });
  assert.equal(list.rows[0]?.onHand, 9);
  assert.equal(list.rows[0]?.available, 9);
});
