/**
 * Doc 07 Phase E, against a real database.
 *
 * Three rules, each of them something legacy got wrong:
 *   · the export's MONEY columns are decided on the server — a customer
 *     user's file does not contain base cost, however the request was made
 *     (legacy pruned them in the browser, so the numbers shipped anyway);
 *   · re-pricing refuses an order that has already been charged, because the
 *     money moved and the ledger would stop matching the order;
 *   · artwork can be attached while an order is PENDING and not after — the
 *     printer is downstream.
 *
 * Run: npm run test:money -w @opcreative/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, Prisma, type UserRole } from "@opcreative/db";

import { exportOrders } from "./service/export.ts";
import { recalcOrders, setOrderArtwork, ArtworkError } from "./service/artwork.ts";
import { orderStatusSummary } from "./service/reads.ts";

let adminId: string;
let sellerId: string;
let packerId: string;
let siteId: number;
let skuId: number;
let pendingOrder: number;
let paidOrder: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const packer = () => ({ id: packerId, roles: ["WAREHOUSE"] as UserRole[] });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

/** A 1x1 PNG, in memory — nothing here should touch the disk except the two
 * tests that mean to. */
const upload = (name: string, type = "image/png", size = 1024): File =>
  ({ name, type, size, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as File;

before(async () => {
  const [a, s, p] = await Promise.all([
    prisma.user.create({ data: { email: "lft-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "lft-seller@test.local", roles: ["SELLER"], tier: 1 } }),
    prisma.user.create({ data: { email: "lft-packer@test.local", roles: ["WAREHOUSE"] } }),
  ]);
  adminId = a.id;
  sellerId = s.id;
  packerId = p.id;

  const site = await prisma.warehouse.create({ data: { code: "LFT-1", name: "Leftovers site" } });
  siteId = site.id;
  await prisma.warehouseMember.create({
    data: { userId: packerId, warehouseId: siteId, isPrimary: true },
  });

  // Tier 1 pays 7.50; the base (tier 0) price is 9.00.
  const sku = await prisma.productVariant.create({
    data: {
      sku: "LFT-SKU",
      salePrice: new Prisma.Decimal("12.00"),
      variant: { create: { name: "Leftovers tee", key: "lft-tee" } },
      product: { create: { name: "Black / L", key: "lft-black-l" } },
      prices: {
        create: [
          { tier: 0, price: new Prisma.Decimal("9.00") },
          { tier: 1, price: new Prisma.Decimal("7.50") },
        ],
      },
    },
    select: { id: true },
  });
  skuId = sku.id;

  const [p1, p2] = await Promise.all([
    prisma.order.create({
      data: {
        quantity: 2,
        placedAt: new Date(),
        customerId: sellerId,
        warehouseId: siteId,
        productVariantId: skuId,
        status: "PENDING",
        baseCost: new Prisma.Decimal("99.00"),
        externalId: "LFT-PENDING",
      },
      select: { id: true },
    }),
    prisma.order.create({
      data: {
        quantity: 1,
        placedAt: new Date(),
        customerId: sellerId,
        warehouseId: siteId,
        productVariantId: skuId,
        status: "ASSIGNED",
        paid: true,
        baseCost: new Prisma.Decimal("7.50"),
        externalId: "LFT-PAID",
      },
      select: { id: true },
    }),
  ]);
  pendingOrder = p1.id;
  paidOrder = p2.id;
});

// ── E1 export ────────────────────────────────────────────────────────────────

test("the money columns are a SERVER decision, not a client one", async () => {
  const staff = await exportOrders(admin(), { ids: [pendingOrder, paidOrder] });
  assert.equal(staff.withMoney, true);
  assert.equal(staff.rows, 2);
  assert.ok(staff.url.length > 0, "the export is a link, not a stream");

  // The same call as a customer user: the file exists, the money does not.
  const floor = await exportOrders(packer(), { ids: [pendingOrder, paidOrder] });
  assert.equal(floor.withMoney, false, "no transactions.read.all, no money columns");
  assert.equal(floor.rows, 2, "they still get the rows they may see");
});

test("the export runs the caller's scope, not the ids they typed", async () => {
  const outsider = await prisma.user.create({
    data: { email: "lft-outsider@test.local", roles: ["SELLER"] },
  });
  const result = await exportOrders(
    { id: outsider.id, roles: ["SELLER"] as UserRole[] },
    { ids: [pendingOrder, paidOrder] },
  );
  assert.equal(result.rows, 0, "ids from a URL do not widen a scope");
});

// ── E2 recalculate ───────────────────────────────────────────────────────────

test("re-pricing uses the seller's tier and only touches unpaid orders", async () => {
  const result = await recalcOrders(admin(), [pendingOrder], ctx());
  assert.equal(result.updated, 1);

  const column = await prisma.order.findUniqueOrThrow({
    where: { id: pendingOrder },
    select: { baseCost: true },
  });
  assert.equal(column.baseCost?.toFixed(2), "15.00", "tier-1 price 7.50 × quantity 2");

  // Running it again changes nothing — the price is already right.
  const again = await recalcOrders(admin(), [pendingOrder], ctx());
  assert.equal(again.updated, 0);
  assert.equal(again.unchanged, 1);
});

test("an order that has already been charged is refused by name", async () => {
  await assert.rejects(
    () => recalcOrders(admin(), [paidOrder], ctx()),
    (e) => e instanceof ArtworkError && codeOf(e) === "already-charged",
  );

  const column = await prisma.order.findUniqueOrThrow({
    where: { id: paidOrder },
    select: { baseCost: true },
  });
  assert.equal(column.baseCost?.toFixed(2), "7.50", "and its price did not move");
});

// ── E3 artwork ───────────────────────────────────────────────────────────────

test("a design URL lands on the order and a mockup URL creates its column", async () => {
  await setOrderArtwork(
    admin(),
    pendingOrder,
    { designUrl: "https://cdn.example.com/design.png", mockupUrl: "https://cdn.example.com/m.png" },
    {},
    ctx(),
  );

  const column = await prisma.order.findUniqueOrThrow({
    where: { id: pendingOrder },
    select: { imageUrl: true, mockup: { select: { url: true, thumbnail: true, name: true } } },
  });
  assert.equal(column.imageUrl, "https://cdn.example.com/design.png");
  assert.equal(column.mockup?.url, "https://cdn.example.com/m.png");
  assert.equal(column.mockup?.thumbnail, "https://cdn.example.com/m.png", "the picture is its own thumbnail");
  assert.equal(column.mockup?.name, "LFT-PENDING", "named after the order it belongs to");
});

test("artwork cannot be swapped once the order is in production", async () => {
  await assert.rejects(
    () => setOrderArtwork(admin(), paidOrder, { designUrl: "https://x/y.png" }, {}, ctx()),
    (e) => e instanceof ArtworkError && codeOf(e) === "not-editable",
  );
});

test("an empty submission and an oversized file are both refused", async () => {
  await assert.rejects(
    () => setOrderArtwork(admin(), pendingOrder, {}, {}, ctx()),
    (e) => e instanceof ArtworkError && codeOf(e) === "nothing-to-set",
  );
  await assert.rejects(
    () =>
      setOrderArtwork(
        admin(),
        pendingOrder,
        {},
        { design: upload("huge.png", "image/png", 11 * 1024 * 1024) },
        ctx(),
      ),
    (e) => codeOf(e) === "file-too-large",
  );
});

// ── E4 summary ───────────────────────────────────────────────────────────────

test("the status cards count the scope, not the page", async () => {
  const summary = await orderStatusSummary(packer(), {});
  const pending = summary.find((s) => s.status === "PENDING");
  const assigned = summary.find((s) => s.status === "ASSIGNED");

  assert.equal(pending?.orders, 1);
  assert.equal(pending?.quantity, 2, "units, not just orders");
  assert.equal(assigned?.orders, 1);
  assert.ok(
    pending?.items.some((i) => i.sku === "LFT-SKU"),
    "and the popover knows what is inside",
  );
});
