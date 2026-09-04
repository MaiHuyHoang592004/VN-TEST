/**
 * Label buying: the rules that decide whether money moves.
 *
 * A wrong answer here is not a rendering bug — it is a carrier charge for a
 * parcel that did not need one, or a box size the carrier re-rates weeks later
 * as an unexplained invoice line. The grouping and skip rules are therefore
 * asserted directly, and the provider is a stub: what is being tested is OUR
 * decisions, not KiloShips' uptime.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";
import { previewLabels, parcelsFor, purchaseLabels, __setProviderForTests } from "./purchase.ts";
import { resolveLabelUrl } from "./download.ts";
import type { LabelProvider } from "./provider.ts";

let adminId: string;
let sellerId: string;
let productWithBox: number;
let productNoBox: number;
let variantId: number;
let skuBoxed: number;
let skuBare: number;
const orderIds: number[] = [];
const addressIds: number[] = [];

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });

/** An order with its own shipping address, so grouping has something to group. */
async function makeOrder(opts: {
  zip: string;
  name?: string;
  sku: number;
  quantity?: number;
  withLabel?: boolean;
}) {
  const address = await prisma.address.create({
    data: {
      name: opts.name ?? "Label Recipient",
      line1: "1 Test Way",
      city: "Testville",
      state: "NY",
      zip: opts.zip,
      country: "US",
    },
    select: { id: true },
  });
  addressIds.push(address.id);
  const order = await prisma.order.create({
    data: {
      externalId: `LB-${opts.zip}-${addressIds.length}`,
      customerId: sellerId,
      productVariantId: opts.sku,
      productId: opts.sku === skuBoxed ? productWithBox : productNoBox,
      variantId,
      shippingAddressId: address.id,
      quantity: opts.quantity ?? 1,
      placedAt: new Date(),
      status: "FULFILLED",
      ...(opts.withLabel
        ? {
            shipments: {
              create: { trackingNumber: `TRK${address.id}`, labelUrl: "https://example.com/l.pdf" },
            },
          }
        : {}),
    },
    select: { id: true },
  });
  orderIds.push(order.id);
  return order.id;
}

before(async () => {
  const [a, s] = await Promise.all([
    prisma.user.create({ data: { email: "lb-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "lb-seller@test.local", roles: ["SELLER"] } }),
  ]);
  adminId = a.id;
  sellerId = s.id;

  // The box rules live on the PRODUCT as data — a customer fact, not code.
  const boxed = await prisma.product.create({
    data: {
      name: "Boxed Wallet",
      key: "lb-boxed",
      status: "ACTIVE",
      configs: {
        parcel: {
          single: { length: 6, width: 4, height: 1, weight: 3 },
          multiple: { length: 9, width: 6, height: 2, weight: 3 },
          distanceUnit: "in",
          massUnit: "oz",
        },
      },
    },
  });
  const bare = await prisma.product.create({
    data: { name: "Unboxed Wallet", key: "lb-bare", status: "ACTIVE" },
  });
  const v = await prisma.variant.create({ data: { name: "Label Black", key: "lb-black" } });
  productWithBox = boxed.id;
  productNoBox = bare.id;
  variantId = v.id;
  skuBoxed = (await prisma.productVariant.create({ data: { productId: boxed.id, variantId: v.id } })).id;
  skuBare = (await prisma.productVariant.create({ data: { productId: bare.id, variantId: v.id } })).id;
});

after(async () => {
  await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.address.deleteMany({ where: { id: { in: addressIds } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: [skuBoxed, skuBare] } } });
  await prisma.variant.deleteMany({ where: { id: { in: [productWithBox, productNoBox] } } });
  await prisma.product.deleteMany({ where: { id: variantId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, sellerId] } } });
  await prisma.$disconnect();
});

test("orders to one doorstep become one parcel; different addresses do not", async () => {
  const a1 = await makeOrder({ zip: "10001", sku: skuBoxed });
  const a2 = await makeOrder({ zip: "10001", sku: skuBoxed });
  const b1 = await makeOrder({ zip: "94107", sku: skuBoxed });

  const { groups } = await previewLabels(admin(), [a1, a2, b1]);
  assert.equal(groups.length, 2, "two destinations, two parcels");
  const sizes = groups.map((g) => g.orders.length).sort();
  assert.deepEqual(sizes, [1, 2], "the shared address shipped together");
  assert.ok(groups.every((g) => g.willPurchase), "both are buyable");
});

test("a parcel that already has a label is skipped, not bought again", async () => {
  const withLabel = await makeOrder({ zip: "20002", sku: skuBoxed, withLabel: true });
  const { groups } = await previewLabels(admin(), [withLabel]);
  assert.equal(groups[0].willPurchase, false);
  assert.equal(groups[0].skipReason, "already-has-label", "buying twice is two carrier charges");

  // …unless someone explicitly asks for a second label (a reship).
  const forced = await previewLabels(admin(), [withLabel], true);
  assert.equal(forced.groups[0].willPurchase, true, "allowMultiple is the deliberate override");
});

test("a variant with no box size is skipped — never guessed", async () => {
  const bare = await makeOrder({ zip: "30003", sku: skuBare });
  const { groups } = await previewLabels(admin(), [bare]);
  assert.equal(groups[0].willPurchase, false);
  assert.equal(groups[0].skipReason, "missing-dimensions");
  assert.deepEqual(groups[0].parcels, [], "and no invented dimensions leaked into the preview");
});

test("the box grows with the count, and the weight scales with it", () => {
  // configs lives on the PRODUCT, not the variant — see parcelsFor's own
  // doc-comment and seed-demo.ts, which writes it there.
  const one = parcelsFor([{ quantity: 1, product: boxedConfig() }] as never);
  const many = parcelsFor([{ quantity: 3, product: boxedConfig() }] as never);
  assert.equal(one?.[0].length, 6, "one piece uses the single box");
  assert.equal(many?.[0].length, 9, "three pieces use the bigger box");
  assert.equal(one?.[0].weight, 3);
  assert.equal(many?.[0].weight, 9, "weight is per piece, the box is not");
});

test("a preview is read-only — nothing is bought by looking", async () => {
  const id = await makeOrder({ zip: "40004", sku: skuBoxed });
  await previewLabels(admin(), [id]);
  const shipments = await prisma.shipment.count({ where: { orderId: id } });
  assert.equal(shipments, 0, "preview must never create a shipment");
});

// ── purchaseLabels: the money path, under real concurrency ─────────────────
//
// SHP-03: two purchase requests for the SAME orders — a double-click, or a
// genuine client retry racing the first attempt's own slow response — must
// buy exactly once. The provider here is a controllable fake so the RACE
// WINDOW is real (an artificial delay inside "the carrier call") without
// depending on KiloShips' actual uptime, per this file's own header.

const fakeProvider = (delayMs: number): LabelProvider & { calls: number } => {
  const p = {
    calls: 0,
    name: "fake",
    async purchase(group: { referenceId: string }) {
      p.calls++;
      await new Promise((r) => setTimeout(r, delayMs));
      return {
        labelUrl: "https://example.com/concurrent-label.pdf",
        trackingNumber: `CONCUR-${group.referenceId}`,
        provider: "fake",
        method: "usps_ground_advantage",
        cost: "5.00",
        raw: { referenceId: group.referenceId },
      };
    },
  };
  return p;
};

test("two concurrent purchases for the same order buy exactly once", async () => {
  process.env.KILOSHIPS_API_KEY = "test-key";
  const fake = fakeProvider(150);
  __setProviderForTests(fake);
  const auditCtx = { actor: admin(), ip: null, userAgent: null };

  try {
    const id = await makeOrder({ zip: "60006", sku: skuBoxed });

    const [r1, r2] = await Promise.all([
      purchaseLabels(admin(), [id], auditCtx),
      purchaseLabels(admin(), [id], auditCtx),
    ]);

    assert.equal(fake.calls, 1, "the carrier was called exactly once, not twice, for one order");

    const results = [r1, r2];
    assert.equal(
      results.filter((r) => r.purchased.length === 1).length,
      1,
      "exactly one of the two calls actually bought it",
    );
    assert.equal(
      results.filter((r) => r.skipped.some((s) => s.reason === "already-has-label")).length,
      1,
      "the OTHER call recognised it was already bought — success, not a failure",
    );
    assert.equal(results.some((r) => r.failed.length > 0), false, "neither call errors");

    const shipments = await prisma.shipment.findMany({ where: { orderId: id } });
    assert.equal(shipments.length, 1, "one Shipment row — not two carrier charges recorded as two");
  } finally {
    __setProviderForTests(null);
    delete process.env.KILOSHIPS_API_KEY;
  }
});

test("a retry after the first attempt already committed is a clean skip, sequentially too", async () => {
  process.env.KILOSHIPS_API_KEY = "test-key";
  const fake = fakeProvider(0);
  __setProviderForTests(fake);
  const auditCtx = { actor: admin(), ip: null, userAgent: null };

  try {
    const id = await makeOrder({ zip: "60007", sku: skuBoxed });

    const first = await purchaseLabels(admin(), [id], auditCtx);
    assert.equal(first.purchased.length, 1);
    assert.equal(fake.calls, 1);

    // The exact "click Buy again" scenario SHP-03 names — not a double-click
    // racing the first response, just a plain repeat of the same request.
    const retry = await purchaseLabels(admin(), [id], auditCtx);
    assert.equal(retry.purchased.length, 0);
    assert.equal(retry.skipped[0]?.reason, "already-has-label");
    assert.equal(fake.calls, 1, "the carrier was never called a second time");

    const shipments = await prisma.shipment.count({ where: { orderId: id } });
    assert.equal(shipments, 1);
  } finally {
    __setProviderForTests(null);
    delete process.env.KILOSHIPS_API_KEY;
  }
});

test("different orders purchased at the same time are NOT serialized against each other", async () => {
  process.env.KILOSHIPS_API_KEY = "test-key";
  const fake = fakeProvider(150);
  __setProviderForTests(fake);
  const auditCtx = { actor: admin(), ip: null, userAgent: null };

  try {
    const a = await makeOrder({ zip: "60008", sku: skuBoxed });
    const b = await makeOrder({ zip: "60009", sku: skuBoxed });

    const started = Date.now();
    const [ra, rb] = await Promise.all([
      purchaseLabels(admin(), [a], auditCtx),
      purchaseLabels(admin(), [b], auditCtx),
    ]);
    const elapsed = Date.now() - started;

    assert.equal(ra.purchased.length, 1);
    assert.equal(rb.purchased.length, 1);
    assert.equal(fake.calls, 2, "two DIFFERENT orders, two real purchases");
    // The advisory lock is keyed by referenceId (which differs per order
    // here) — if it were accidentally serializing ALL purchases instead of
    // just same-referenceId ones, this would take ~2×150ms instead of ~150ms.
    assert.ok(elapsed < 280, `unrelated orders should not wait on each other's lock (took ${elapsed}ms)`);
  } finally {
    __setProviderForTests(null);
    delete process.env.KILOSHIPS_API_KEY;
  }
});

test("ids outside the actor's scope are reported, not silently dropped", async () => {
  const mine = await makeOrder({ zip: "50005", sku: skuBoxed });
  const seller = { id: sellerId, roles: ["SELLER"] as UserRole[] };
  // The seller owns these orders, so they resolve; a made-up id does not.
  const { selected, skippedOrders } = await previewLabels(seller, [mine, 99_999_999]);
  assert.equal(selected, 1);
  assert.equal(skippedOrders, 1, "the operator is told their selection shrank");
});

test("provider link shapes resolve to something that returns a PDF", async () => {
  // Legacy learned both of these the hard way: a share link and a Drive view
  // link are web pages, and saving them as .pdf produces an unopenable file.
  const pirate = await resolveLabelUrl("https://ship.pirateship.com/share/AbC123_x");
  assert.deepEqual(pirate, {
    graphql: "https://ship.pirateship.com/graphql",
    token: "AbC123_x",
  });

  const drive = await resolveLabelUrl("https://drive.google.com/file/d/FILEID123/view?usp=sharing");
  assert.equal(drive, "https://drive.google.com/uc?export=download&id=FILEID123");

  const plain = await resolveLabelUrl("https://carrier.example.com/label.pdf");
  assert.equal(plain, "https://carrier.example.com/label.pdf", "an ordinary URL is left alone");
});

/** The shape parcelsFor reads, without touching the database. */
const boxedConfig = () => ({
  configs: {
    parcel: {
      single: { length: 6, width: 4, height: 1, weight: 3 },
      multiple: { length: 9, width: 6, height: 2, weight: 3 },
      distanceUnit: "in",
      massUnit: "oz",
    },
  },
});
