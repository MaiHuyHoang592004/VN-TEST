/**
 * Receipt invariants, against a real database.
 *
 * The one that matters most: receiving is DELTA-BASED and MONOTONIC. Receive 5
 * of 10 today and 8 tomorrow and the shelf gains 5 then 3, never 5 then 8.
 * Everything else here exists to stop that rule being quietly broken —
 * especially the concurrent case, which is the ONLY test that exercises the
 * column lock. Every sequential test below passes with the lock deleted.
 *
 * Run: npm run test:money -w @opcreative/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@opcreative/db";

import {
  createReceipt,
  getReceipt,
  receiveShipment,
  rejectReceipt,
  shipmentsReport,
  updateReceipt,
} from "./receipts/service.ts";

let adminId: string;
let packerId: string;
let siteA: number;
let siteB: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
/** A customer user who is a member of site A only. */
const packer = () => ({ id: packerId, roles: ["WAREHOUSE_ADMIN"] as UserRole[] });
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

async function newMaterial(sku: string) {
  const m = await prisma.material.create({ data: { sku, name: `Material ${sku}` } });
  return m.id;
}

const onHandOf = async (materialId: number, warehouseId: number) =>
  (
    await prisma.materialStock.findUnique({
      where: { warehouseId_materialId: { warehouseId, materialId } },
      select: { quantity: true },
    })
  )?.quantity ?? 0;

/** One receipt, one shipment, one line of `quantity`. The shape most tests want. */
async function newReceipt(opts: { sku: string; quantity: number; warehouseId?: number }) {
  const materialId = await newMaterial(opts.sku);
  const created = await createReceipt(
    admin(),
    {
      itemType: "MATERIAL",
      warehouseId: opts.warehouseId ?? siteA,
      shipments: [{ lines: [{ materialId, requestedQuantity: opts.quantity }] }],
    },
    ctx(admin()),
  );
  const full = await getReceipt(admin(), created.id);
  return {
    materialId,
    receiptId: created.id,
    code: created.code,
    shipmentId: full.shipments[0]!.id,
    lineId: full.shipments[0]!.lines[0]!.id,
  };
}

before(async () => {
  const [a, p] = await Promise.all([
    prisma.user.create({ data: { email: "rcpt-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "rcpt-packer@test.local", roles: ["WAREHOUSE_ADMIN"] } }),
  ]);
  adminId = a.id;
  packerId = p.id;

  const [wa, wb] = await Promise.all([
    prisma.warehouse.create({ data: { code: "RCP-A", name: "Receipt site A" } }),
    prisma.warehouse.create({ data: { code: "RCP-B", name: "Receipt site B" } }),
  ]);
  siteA = wa.id;
  siteB = wb.id;

  await prisma.warehouseMember.create({
    data: { userId: packerId, warehouseId: siteA, isPrimary: true },
  });
});

// ── Creating ─────────────────────────────────────────────────────────────────

test("a receipt is a plan: creating one moves no stock", async () => {
  const r = await newReceipt({ sku: "RCP-PLAN", quantity: 10 });
  assert.match(r.code, /^SR-\d{8}-[A-Z0-9]{5}$/, "one code series for both item types");
  assert.equal(await onHandOf(r.materialId, siteA), 0, "nothing is on the shelf yet");
});

test("shipments are numbered S1, S2… when the form leaves the code blank", async () => {
  const materialId = await newMaterial("RCP-MULTI");
  const created = await createReceipt(
    admin(),
    {
      itemType: "MATERIAL",
      warehouseId: siteA,
      shipments: [
        { lines: [{ materialId, requestedQuantity: 3 }] },
        { lines: [{ materialId, requestedQuantity: 4 }] },
      ],
    },
    ctx(admin()),
  );
  const full = await getReceipt(admin(), created.id);
  assert.deepEqual(
    full.shipments.map((s) => s.shipmentCode),
    ["S1", "S2"],
  );
});

test("a line pointing at both a material and a SKU is refused", async () => {
  // The database has a CHECK constraint for this; the schema refuses it first
  // so the floor gets a sentence rather than a constraint name.
  const materialId = await newMaterial("RCP-XOR");
  const product = await prisma.productVariant.create({
    data: {
      sku: "RCP-XOR-SKU",
      variant: { create: { name: "Receipt variant", key: "receipt-variant" } },
      product: { create: { name: "Receipt product", key: "receipt-product" } },
    },
  });
  await assert.rejects(() =>
    createReceipt(
      admin(),
      {
        itemType: "MATERIAL",
        warehouseId: siteA,
        shipments: [
          { lines: [{ materialId, productVariantId: product.id, requestedQuantity: 1 }] },
        ],
      },
      ctx(admin()),
    ),
  );
});

test("a line whose item type contradicts the receipt is refused", async () => {
  const product = await prisma.productVariant.findFirstOrThrow({
    where: { sku: "RCP-XOR-SKU" },
    select: { id: true },
  });
  await assert.rejects(
    () =>
      createReceipt(
        admin(),
        {
          itemType: "MATERIAL",
          warehouseId: siteA,
          shipments: [{ lines: [{ productVariantId: product.id, requestedQuantity: 1 }] }],
        },
        ctx(admin()),
      ),
    (e: Error) => codeOf(e) === "item-not-found",
  );
});

// ── Receiving: the delta rule ────────────────────────────────────────────────

test("re-receiving applies the DELTA only — 5 then 8 is +5 then +3, never +13", async () => {
  const r = await newReceipt({ sku: "RCP-DELTA", quantity: 10 });

  await receiveShipment(
    admin(),
    { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 5 }] },
    ctx(admin()),
  );
  assert.equal(await onHandOf(r.materialId, siteA), 5);

  await receiveShipment(
    admin(),
    { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 8 }] },
    ctx(admin()),
  );
  assert.equal(await onHandOf(r.materialId, siteA), 8, "the shelf holds 8, not 13");

  const moves = await prisma.inventoryMovement.findMany({
    where: { materialId: r.materialId, type: "RECEIPT" },
    select: { quantity: true },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(moves.map((m) => m.quantity), [5, 3], "and the ledger says +5 then +3");
});

test("receiving is monotonic — a lower number than is already booked in is refused", async () => {
  const r = await newReceipt({ sku: "RCP-MONO", quantity: 10 });
  await receiveShipment(
    admin(),
    { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 6 }] },
    ctx(admin()),
  );

  await assert.rejects(
    () =>
      receiveShipment(
        admin(),
        { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 4 }] },
        ctx(admin()),
      ),
    (e: Error) => codeOf(e) === "received-below-current",
    "goods already on the shelf cannot be un-received by editing a number",
  );
  assert.equal(await onHandOf(r.materialId, siteA), 6, "and nothing moved");
});

test("CONCURRENT receives of one shipment apply exactly once", async () => {
  // The only test that exercises SELECT … FOR UPDATE. Without the lock both
  // transactions read "0 received", both compute a delta of 7, and the shelf
  // gains 14. Sequentially, the same two calls pass either way.
  const r = await newReceipt({ sku: "RCP-RACE", quantity: 7 });

  const receive = () =>
    receiveShipment(
      admin(),
      { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 7 }] },
      ctx(admin()),
    );
  await Promise.all([receive(), receive()]);

  assert.equal(await onHandOf(r.materialId, siteA), 7, "seven arrived, seven are on the shelf");
  const moves = await prisma.inventoryMovement.count({
    where: { materialId: r.materialId, type: "RECEIPT" },
  });
  assert.equal(moves, 1, "and the second receive wrote no phantom +0 column");
});

test("a zero-delta re-submission changes nothing and logs nothing", async () => {
  const r = await newReceipt({ sku: "RCP-NOOP", quantity: 4 });
  const payload = {
    receiptId: r.receiptId,
    shipmentId: r.shipmentId,
    lines: [{ lineId: r.lineId, receivedQuantity: 2 }],
  };
  await receiveShipment(admin(), payload, ctx(admin()));
  await receiveShipment(admin(), payload, ctx(admin()));

  assert.equal(await onHandOf(r.materialId, siteA), 2);
  const moves = await prisma.inventoryMovement.count({
    where: { materialId: r.materialId, type: "RECEIPT" },
  });
  assert.equal(moves, 1, "a double-click is not an event");
});

// ── Status roll-up ───────────────────────────────────────────────────────────

test("a partial receive holds both statuses open; the last line flips both", async () => {
  const r = await newReceipt({ sku: "RCP-ROLLUP", quantity: 10 });

  let result = await receiveShipment(
    admin(),
    { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 4 }] },
    ctx(admin()),
  );
  assert.equal(result.shipment, "PARTIAL_RECEIVED");
  assert.equal(result.receipt, "PARTIAL");

  result = await receiveShipment(
    admin(),
    { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 10 }] },
    ctx(admin()),
  );
  assert.equal(result.shipment, "RECEIVED");
  assert.equal(result.receipt, "COMPLETE");

  const done = await getReceipt(admin(), r.receiptId);
  assert.notEqual(done.approvedAt, null, "completing the last shipment IS the approval");
});

test("rejected units settle a line without ever entering stock", async () => {
  // 8 good, 2 damaged: the line is fully accounted for, so the shipment is
  // finished — but only the 8 are on the shelf.
  const r = await newReceipt({ sku: "RCP-REJLINE", quantity: 10 });
  const result = await receiveShipment(
    admin(),
    {
      receiptId: r.receiptId,
      shipmentId: r.shipmentId,
      lines: [{ lineId: r.lineId, receivedQuantity: 8, rejectedQuantity: 2 }],
    },
    ctx(admin()),
  );
  assert.equal(result.shipment, "RECEIVED", "received + rejected covers what was asked for");
  assert.equal(await onHandOf(r.materialId, siteA), 8, "the damaged two never entered stock");
});

test("a receipt is COMPLETE only when every shipment has landed", async () => {
  const materialId = await newMaterial("RCP-TWOSHIP");
  const created = await createReceipt(
    admin(),
    {
      itemType: "MATERIAL",
      warehouseId: siteA,
      shipments: [
        { lines: [{ materialId, requestedQuantity: 3 }] },
        { lines: [{ materialId, requestedQuantity: 4 }] },
      ],
    },
    ctx(admin()),
  );
  const full = await getReceipt(admin(), created.id);
  const [first, second] = full.shipments;

  const done = await receiveShipment(
    admin(),
    {
      receiptId: created.id,
      shipmentId: first!.id,
      lines: [{ lineId: first!.lines[0]!.id, receivedQuantity: 3 }],
    },
    ctx(admin()),
  );
  assert.equal(done.shipment, "RECEIVED");
  assert.equal(done.receipt, "PARTIAL", "one parcel in, one still out");

  const all = await receiveShipment(
    admin(),
    {
      receiptId: created.id,
      shipmentId: second!.id,
      lines: [{ lineId: second!.lines[0]!.id, receivedQuantity: 4 }],
    },
    ctx(admin()),
  );
  assert.equal(all.receipt, "COMPLETE");
  assert.equal(await onHandOf(materialId, siteA), 7);
});

test("every line of the shipment must be answered", async () => {
  const materialId = await newMaterial("RCP-PARTIALPAYLOAD");
  const created = await createReceipt(
    admin(),
    {
      itemType: "MATERIAL",
      warehouseId: siteA,
      shipments: [
        {
          lines: [
            { materialId, requestedQuantity: 2 },
            { materialId, requestedQuantity: 3 },
          ],
        },
      ],
    },
    ctx(admin()),
  );
  const full = await getReceipt(admin(), created.id);
  const shipment = full.shipments[0]!;

  await assert.rejects(
    () =>
      receiveShipment(
        admin(),
        {
          receiptId: created.id,
          shipmentId: shipment.id,
          lines: [{ lineId: shipment.lines[0]!.id, receivedQuantity: 2 }],
        },
        ctx(admin()),
      ),
    (e: Error) => codeOf(e) === "not-found",
    "an unanswered line makes 'is this shipment finished?' unanswerable",
  );
  assert.equal(await onHandOf(materialId, siteA), 0, "and nothing was booked in");
});

// ── Rejection ────────────────────────────────────────────────────────────────

test("rejecting a receipt never moves stock", async () => {
  const r = await newReceipt({ sku: "RCP-REJECT", quantity: 10 });
  await rejectReceipt(admin(), { receiptId: r.receiptId, reason: "Wrong goods" }, ctx(admin()));

  const after = await getReceipt(admin(), r.receiptId);
  assert.equal(after.status, "REJECTED");
  assert.equal(after.rejectReason, "Wrong goods");
  assert.equal(after.shipments[0]!.status, "REJECTED");
  assert.equal(await onHandOf(r.materialId, siteA), 0, "rejected goods never entered stock");
});

test("a rejected receipt cannot then be received against", async () => {
  const r = await newReceipt({ sku: "RCP-REJTHENRCV", quantity: 5 });
  await rejectReceipt(admin(), { receiptId: r.receiptId }, ctx(admin()));

  await assert.rejects(
    () =>
      receiveShipment(
        admin(),
        { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 5 }] },
        ctx(admin()),
      ),
    (e: Error) => codeOf(e) === "not-receivable",
  );
  assert.equal(await onHandOf(r.materialId, siteA), 0);
});

test("rejecting leaves already-received goods on the shelf", async () => {
  // The paperwork closes; the pallet in the corner does not evaporate.
  const r = await newReceipt({ sku: "RCP-REJPARTIAL", quantity: 10 });
  await receiveShipment(
    admin(),
    { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 4 }] },
    ctx(admin()),
  );
  await rejectReceipt(admin(), { receiptId: r.receiptId, reason: "Cancelled" }, ctx(admin()));

  assert.equal(await onHandOf(r.materialId, siteA), 4, "the four that arrived stay received");
});

// ── Editing ──────────────────────────────────────────────────────────────────

test("a receipt can be rewritten while it is still only a plan", async () => {
  const r = await newReceipt({ sku: "RCP-EDIT", quantity: 5 });
  await updateReceipt(
    admin(),
    r.receiptId,
    {
      itemType: "MATERIAL",
      warehouseId: siteA,
      provider: "New supplier",
      shipments: [{ lines: [{ materialId: r.materialId, requestedQuantity: 9 }] }],
    },
    ctx(admin()),
  );
  const after = await getReceipt(admin(), r.receiptId);
  assert.equal(after.provider, "New supplier");
  assert.equal(after.shipments[0]!.lines[0]!.requestedQuantity, 9);
});

test("editing is refused once anything has been received", async () => {
  // Wipe-and-recreate would delete the line a stock movement was booked
  // against, leaving the ledger pointing at a column that no longer exists.
  const r = await newReceipt({ sku: "RCP-EDITLOCK", quantity: 5 });
  await receiveShipment(
    admin(),
    { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 1 }] },
    ctx(admin()),
  );

  await assert.rejects(
    () =>
      updateReceipt(
        admin(),
        r.receiptId,
        {
          itemType: "MATERIAL",
          warehouseId: siteA,
          shipments: [{ lines: [{ materialId: r.materialId, requestedQuantity: 99 }] }],
        },
        ctx(admin()),
      ),
    (e: Error) => codeOf(e) === "not-editable",
  );
});

// ── Site scoping ─────────────────────────────────────────────────────────────

test("a customer user cannot receive another site's shipment", async () => {
  const r = await newReceipt({ sku: "RCP-SCOPE", quantity: 5, warehouseId: siteB });

  await assert.rejects(
    () =>
      receiveShipment(
        packer(),
        { receiptId: r.receiptId, shipmentId: r.shipmentId, lines: [{ lineId: r.lineId, receivedQuantity: 5 }] },
        ctx(packer()),
      ),
    (e: Error) => codeOf(e) === "customer-not-allowed",
  );
  assert.equal(await onHandOf(r.materialId, siteB), 0);

  // Their own site works, so this is scoping and not a broken guard.
  const mine = await newReceipt({ sku: "RCP-SCOPE-OK", quantity: 5 });
  const ok = await receiveShipment(
    packer(),
    { receiptId: mine.receiptId, shipmentId: mine.shipmentId, lines: [{ lineId: mine.lineId, receivedQuantity: 5 }] },
    ctx(packer()),
  );
  assert.equal(ok.ok, true);
});

test("another site's receipt is not even readable", async () => {
  const r = await newReceipt({ sku: "RCP-HIDDEN", quantity: 1, warehouseId: siteB });
  await assert.rejects(
    () => getReceipt(packer(), r.receiptId),
    (e: Error) => codeOf(e) === "not-found",
    "an id the actor cannot see is indistinguishable from one that is gone",
  );
});

// ── The report behind the tiles ──────────────────────────────────────────────

test("variance is computed from the rows, never stored", async () => {
  const r = await newReceipt({ sku: "RCP-VARIANCE", quantity: 10 });
  // Short delivery, settled: 6 good + 1 damaged against 10 asked for.
  await receiveShipment(
    admin(),
    {
      receiptId: r.receiptId,
      shipmentId: r.shipmentId,
      lines: [{ lineId: r.lineId, receivedQuantity: 6, rejectedQuantity: 1 }],
    },
    ctx(admin()),
  );

  const report = await shipmentsReport(admin(), { warehouseId: siteA });
  const column = report.quantityVariances.find((v) => v.code === r.code);
  assert.ok(column, "a short delivery shows up as a variance");
  assert.equal(column.variance, -3, "6 received + 1 rejected − 10 requested");

  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'stock_receipt_lines'`,
  );
  assert.equal(
    columns.some((c) => c.column_name.includes("variance")),
    false,
    "and there is no row for it — it is derived from the two numbers it sits between",
  );
});

test("an overdue shipment is one still in flight, not one that took a while", async () => {
  const materialId = await newMaterial("RCP-ETA");
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const created = await createReceipt(
    admin(),
    {
      itemType: "MATERIAL",
      warehouseId: siteA,
      shipments: [
        { expectedArrivalAt: yesterday, lines: [{ materialId, requestedQuantity: 2 }] },
      ],
    },
    ctx(admin()),
  );

  let report = await shipmentsReport(admin(), { warehouseId: siteA });
  const before = report.overdueEta;
  assert.ok(before > 0, "a past ETA with nothing received is overdue");

  const full = await getReceipt(admin(), created.id);
  await receiveShipment(
    admin(),
    {
      receiptId: created.id,
      shipmentId: full.shipments[0]!.id,
      lines: [{ lineId: full.shipments[0]!.lines[0]!.id, receivedQuantity: 2 }],
    },
    ctx(admin()),
  );

  report = await shipmentsReport(admin(), { warehouseId: siteA });
  assert.equal(report.overdueEta, before - 1, "once it lands it is not late any more");
});
