/**
 * BOM configuration invariants.
 *
 * The one that carries the domain: exactly ONE version per product may be
 * ACTIVE, on all three activation paths. Two active recipes make "what does
 * this order need?" ambiguous at the one moment it must not be.
 *
 * Run: npm run test:money -w @opcreative/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@opcreative/db";

import {
  activateBom,
  createBom,
  deleteBom,
  duplicateBom,
  explode,
  getBom,
  listBoms,
  previewConsumption,
  updateBom,
} from "./boms/service.ts";

let adminId: string;
let warehouseId: number;
let productId: number;
let variantSeq = 0;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

async function newVariant(sku: string) {
  variantSeq += 1;
  const variant = await prisma.variant.create({
    data: { name: `BOM variant ${variantSeq}`, key: `bom-variant-${variantSeq}` },
  });
  const pv = await prisma.productVariant.create({
    data: { productId, variantId: variant.id, sku },
  });
  return pv.id;
}

async function newMaterial(sku: string) {
  const m = await prisma.material.create({ data: { sku, name: `Material ${sku}` } });
  return m.id;
}

const line = (materialId: number, qtyPerUnit: number, extra: Record<string, unknown> = {}) => ({
  materialId,
  componentSku: `C-${materialId}`,
  quantityPerUnit: qtyPerUnit,
  unit: "pcs",
  wastageRate: 0,
  stage: "PRODUCTION" as const,
  required: true,
  sortOrder: 0,
  ...extra,
});

const activeVersionsOf = (productVariantId: number) =>
  prisma.bom.findMany({
    where: { productVariantId, status: "ACTIVE", deletedAt: null },
    select: { version: true },
  });

before(async () => {
  const a = await prisma.user.create({
    data: { email: "bom-admin@test.local", roles: ["ADMIN"] },
  });
  adminId = a.id;

  const w = await prisma.warehouse.create({ data: { code: "BOM-A", name: "BOM site" } });
  warehouseId = w.id;

  const p = await prisma.product.create({ data: { name: "BOM product", key: "bom-product" } });
  productId = p.id;
});

// ── One active per product ───────────────────────────────────────────────────

test("creating a second ACTIVE version retires the first", async () => {
  const pv = await newVariant("BOM-ONE-ACTIVE");
  const m = await newMaterial("BOM-M1");

  await createBom(admin(), pv, { name: "v1", status: "ACTIVE", lines: [line(m, 1)] }, ctx());
  await createBom(admin(), pv, { name: "v2", status: "ACTIVE", lines: [line(m, 2)] }, ctx());

  const active = await activeVersionsOf(pv);
  assert.equal(active.length, 1, "exactly one recipe is the one the floor follows");
  assert.equal(active[0]!.version, 2, "and it is the newer one");
});

test("updating a draft to ACTIVE retires the current active", async () => {
  const pv = await newVariant("BOM-UPDATE-ACTIVE");
  const m = await newMaterial("BOM-M2");

  await createBom(admin(), pv, { name: "v1", status: "ACTIVE", lines: [line(m, 1)] }, ctx());
  const draft = await createBom(
    admin(),
    pv,
    { name: "v2", status: "DRAFT", lines: [line(m, 3)] },
    ctx(),
  );
  await updateBom(admin(), draft.id, { name: "v2", status: "ACTIVE", lines: [line(m, 3)] }, ctx());

  const active = await activeVersionsOf(pv);
  assert.equal(active.length, 1);
  assert.equal(active[0]!.version, 2);
});

test("activate() retires the current active too — all three paths agree", async () => {
  const pv = await newVariant("BOM-ACTIVATE");
  const m = await newMaterial("BOM-M3");

  await createBom(admin(), pv, { name: "v1", status: "ACTIVE", lines: [line(m, 1)] }, ctx());
  const second = await createBom(
    admin(),
    pv,
    { name: "v2", status: "DRAFT", lines: [line(m, 1)] },
    ctx(),
  );
  await activateBom(admin(), second.id, ctx());

  const active = await activeVersionsOf(pv);
  assert.equal(active.length, 1);
  assert.equal(active[0]!.version, 2);
});

test("an empty BOM cannot be activated, by any route", async () => {
  // A BOM with no lines would let assignment "reserve" nothing and report
  // success — an order built out of stock nobody took.
  const pv = await newVariant("BOM-EMPTY");
  const empty = await createBom(admin(), pv, { name: "empty", status: "DRAFT", lines: [] }, ctx());

  await assert.rejects(
    () => activateBom(admin(), empty.id, ctx()),
    (e: Error) => codeOf(e) === "not-editable",
  );
  await assert.rejects(
    () => updateBom(admin(), empty.id, { name: "empty", status: "ACTIVE", lines: [] }, ctx()),
    (e: Error) => codeOf(e) === "not-editable",
  );
  await assert.rejects(
    () => createBom(admin(), pv, { name: "also empty", status: "ACTIVE", lines: [] }, ctx()),
    (e: Error) => codeOf(e) === "not-editable",
  );
});

// ── Versions ─────────────────────────────────────────────────────────────────

test("versions are assigned by the server and duplicate lands as a DRAFT", async () => {
  const pv = await newVariant("BOM-VERSIONS");
  const m = await newMaterial("BOM-M4");

  const first = await createBom(admin(), pv, { name: "v1", status: "ACTIVE", lines: [line(m, 2)] }, ctx());
  assert.equal(first.version, 1);

  const copy = await duplicateBom(admin(), first.id, ctx());
  assert.equal(copy.version, 2, "the next free number, not the form's guess");

  const copied = await getBom(admin(), copy.id);
  assert.equal(copied.status, "DRAFT", "a revision does not go live by being copied");
  assert.equal(copied.lines.length, 1, "and it carries the recipe with it");
  assert.equal((await activeVersionsOf(pv))[0]!.version, 1, "v1 is still the live one");
});

test("deleting a BOM is soft — history still names it", async () => {
  const pv = await newVariant("BOM-DELETE");
  const m = await newMaterial("BOM-M5");
  const bom = await createBom(admin(), pv, { name: "v1", status: "ACTIVE", lines: [line(m, 1)] }, ctx());

  await deleteBom(admin(), bom.id, ctx());
  const column = await prisma.bom.findUniqueOrThrow({
    where: { id: bom.id },
    select: { deletedAt: true, status: true },
  });
  assert.notEqual(column.deletedAt, null);
  assert.equal(column.status, "INACTIVE");
  await assert.rejects(() => getBom(admin(), bom.id), (e: Error) => codeOf(e) === "not-found");
});

// ── Explode: the maths ───────────────────────────────────────────────────────

test("required quantity is qty × perUnit × (1 + wastage), rounded UP", async () => {
  // Hand-computed: 7 units × 0.15 m × 1.05 waste = 1.1025 m → 2. You cannot
  // take 1.1025 of anything off a shelf, and rounding DOWN builds short.
  const pv = await newVariant("BOM-MATH");
  const m = await newMaterial("BOM-M6");
  await createBom(
    admin(),
    pv,
    { name: "v1", status: "ACTIVE", lines: [line(m, 0.15, { wastageRate: 0.05 })] },
    ctx(),
  );

  const [req] = await explode(prisma, pv, 7);
  assert.equal(req!.quantity, 2);

  // And a clean multiple stays exact rather than gaining a unit to rounding.
  const pv2 = await newVariant("BOM-MATH-2");
  await createBom(admin(), pv2, { name: "v1", status: "ACTIVE", lines: [line(m, 2)] }, ctx());
  const [exact] = await explode(prisma, pv2, 5);
  assert.equal(exact!.quantity, 10);
});

test("one material on two lines is reserved ONCE, for the total", async () => {
  // Two guarded updates against the same column would race each other, and the
  // second could fail on stock the first just took.
  const pv = await newVariant("BOM-AGGREGATE");
  const m = await newMaterial("BOM-M7");
  await createBom(
    admin(),
    pv,
    {
      name: "v1",
      status: "ACTIVE",
      lines: [line(m, 2), { ...line(m, 3), componentSku: "C-second" }],
    },
    ctx(),
  );

  const reqs = await explode(prisma, pv, 1);
  assert.equal(reqs.length, 1, "one requirement, not two");
  assert.equal(reqs[0]!.quantity, 5, "2 + 3");
});

test("a product with no BOM explodes to itself — the finished-goods path", async () => {
  const pv = await newVariant("BOM-NONE");
  const reqs = await explode(prisma, pv, 4);
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.ref.itemType, "PRODUCT");
  assert.equal(reqs[0]!.ref.itemId, pv);
  assert.equal(reqs[0]!.quantity, 4, "one for one, no recipe involved");
});

test("an untracked material is on the recipe but holds no stock", async () => {
  const pv = await newVariant("BOM-UNTRACKED");
  const tracked = await newMaterial("BOM-M8");
  const glue = await prisma.material.create({
    data: { sku: "BOM-GLUE", name: "Glue", trackInventory: false },
  });
  await createBom(
    admin(),
    pv,
    { name: "v1", status: "ACTIVE", lines: [line(tracked, 1), line(glue.id, 1)] },
    ctx(),
  );

  const reqs = await explode(prisma, pv, 1);
  assert.equal(reqs.length, 1, "glue is counted by eye, so it reserves nothing");
  assert.equal(reqs[0]!.ref.itemId, tracked);
});

// ── Unmapped lines ───────────────────────────────────────────────────────────

test("a REQUIRED unmapped line blocks the explode; an optional one does not", async () => {
  const pv = await newVariant("BOM-UNMAPPED");
  const m = await newMaterial("BOM-M9");
  await createBom(
    admin(),
    pv,
    {
      name: "v1",
      status: "ACTIVE",
      lines: [
        line(m, 1),
        { ...line(m, 1), materialId: null, componentSku: "MYSTERY", required: true },
      ],
    },
    ctx(),
  );

  await assert.rejects(
    () => explode(prisma, pv, 1),
    (e: Error) => codeOf(e) === "bom-line-unmapped",
    "silently skipping it would build the order short and call it success",
  );

  // The same line, marked optional, is a note to somebody rather than a blocker.
  const pv2 = await newVariant("BOM-UNMAPPED-OPT");
  await createBom(
    admin(),
    pv2,
    {
      name: "v1",
      status: "ACTIVE",
      lines: [
        line(m, 1),
        { ...line(m, 1), materialId: null, componentSku: "MYSTERY", required: false },
      ],
    },
    ctx(),
  );
  const reqs = await explode(prisma, pv2, 1);
  assert.equal(reqs.length, 1);
});

test("an unmapped line is counted as incomplete on the list", async () => {
  const list = await listBoms(admin(), { search: "BOM-UNMAPPED" });
  const column = list.rows.find((r) => r.productVariant.sku === "BOM-UNMAPPED");
  assert.ok(column);
  assert.equal(column.summary.unmappedLineCount, 1);
  assert.equal(column.summary.lineCount, 2);
  assert.ok(list.tiles.unmappedLines > 0, "and the tile counts them server-side");
});

// ── Preview ──────────────────────────────────────────────────────────────────

test("preview reports the shortage the reservation would hit", async () => {
  const pv = await newVariant("BOM-PREVIEW");
  const m = await newMaterial("BOM-M10");
  await createBom(admin(), pv, { name: "v1", status: "ACTIVE", lines: [line(m, 2)] }, ctx());
  await prisma.materialStock.create({
    data: { warehouseId, materialId: m, quantity: 6 },
  });

  const preview = await previewConsumption(admin(), { productVariantId: pv, quantity: 5, warehouseId });
  assert.equal(preview.lines.length, 1);
  assert.equal(preview.lines[0]!.required, 10);
  assert.equal(preview.lines[0]!.available, 6);
  assert.equal(preview.lines[0]!.shortage, 4);
  assert.equal(preview.totalShortage, 4);
});

test("preview surfaces an unmapped component as a line, not an error page", async () => {
  const pv = await prisma.productVariant.findFirstOrThrow({
    where: { sku: "BOM-UNMAPPED" },
    select: { id: true },
  });
  const preview = await previewConsumption(admin(), { productVariantId: pv.id, quantity: 1 });
  assert.equal(preview.blocked, true);
  assert.equal(preview.lines[0]!.mappingStatus, "UNMAPPED");
});
