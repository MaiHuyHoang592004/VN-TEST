/**
 * The XOR constraints, which nothing else in the codebase will ever prove.
 *
 * A movement, a reservation and a receipt line each point at EXACTLY one
 * thing: a material or a variant product. Prisma cannot express that — both
 * columns are nullable Int? to it — so the rule lives as three CHECK
 * constraints hand-written into the migrations. Correct application code never
 * violates them, which means without this file a dropped constraint would sail
 * through every other suite green and only surface as stock moving on an item
 * nobody can name.
 *
 * Run: npm run test:money -w @opcreative/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@opcreative/db";

let warehouseId: number;
let orderId: number;
let receiptId: number;
/// A REAL product, so a foreign key can never be what rejects the write and
/// let a deleted CHECK constraint hide behind a green test.
let variantId: number;

before(async () => {
  const customer = await prisma.warehouse.create({
    data: { code: "XOR-01", name: "XOR test site" },
  });
  warehouseId = customer.id;

  const productVariant = await prisma.productVariant.create({
    data: {
      variant: { create: { name: "XOR variant", key: "xor-variant" } },
      product: { create: { name: "XOR product", key: "xor-product" } },
    },
  });
  variantId = productVariant.id;

  const order = await prisma.order.create({
    data: { quantity: 1, placedAt: new Date(), warehouseId },
  });
  orderId = order.id;

  const receipt = await prisma.stockReceipt.create({
    data: { code: "SR-XOR-00001", itemType: "MATERIAL", warehouseId },
  });
  receiptId = receipt.id;
});

/** The database refused the write — as opposed to quietly taking it. */
const rejects = async (what: string, write: () => Promise<unknown>) => {
  await assert.rejects(write, /violates check constraint|line_target_xor|target_xor/, what);
};

test("a movement names one item, never two and never none", async () => {
  const base = { itemType: "MATERIAL", warehouseId, type: "RECEIPT", quantity: 1 } as const;
  const material = await prisma.material.create({
    data: { sku: "XOR-MAT-1", name: "XOR material" },
  });

  await rejects("both filled", () =>
    prisma.inventoryMovement.create({
      data: { ...base, materialId: material.id, productVariantId: variantId },
    }),
  );
  await rejects("neither filled", () => prisma.inventoryMovement.create({ data: base }));

  // …and the constraint is not simply rejecting everything.
  const ok = await prisma.inventoryMovement.create({
    data: { ...base, materialId: material.id },
  });
  assert.equal(ok.materialId, material.id);
});

test("a reservation names one item, never two and never none", async () => {
  const base = { itemType: "MATERIAL", warehouseId, orderId, quantity: 1 } as const;
  const material = await prisma.material.create({
    data: { sku: "XOR-MAT-2", name: "XOR material 2" },
  });

  await rejects("both filled", () =>
    prisma.inventoryReservation.create({
      data: { ...base, materialId: material.id, productVariantId: variantId },
    }),
  );
  await rejects("neither filled", () => prisma.inventoryReservation.create({ data: base }));

  const ok = await prisma.inventoryReservation.create({
    data: { ...base, materialId: material.id },
  });
  assert.equal(ok.materialId, material.id);
});

test("a receipt line names one item, never two and never none", async () => {
  const base = { receiptId, requestedQuantity: 5 } as const;
  const material = await prisma.material.create({
    data: { sku: "XOR-MAT-3", name: "XOR material 3" },
  });

  await rejects("both filled", () =>
    prisma.stockReceiptLine.create({
      data: { ...base, materialId: material.id, productVariantId: variantId },
    }),
  );
  await rejects("neither filled", () => prisma.stockReceiptLine.create({ data: base }));

  const ok = await prisma.stockReceiptLine.create({
    data: { ...base, materialId: material.id },
  });
  assert.equal(ok.materialId, material.id);
});
