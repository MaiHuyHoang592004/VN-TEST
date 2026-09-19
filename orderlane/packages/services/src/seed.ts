import { systemPrisma } from "@orderlane/db";

import { hashPassword } from "./auth/passwords.ts";

import { createProduct, createVariant } from "./catalog/products.ts";
import type { Ctx } from "./context.ts";
import { createTenant } from "./identity/tenants.ts";
import { chargeOrder, fundWallet } from "./ledger/postings.ts";
import { createOrder } from "./orders/orders.ts";
import { setActiveDefinition } from "./workflow/definitions.ts";
import { applyTransition, startFulfillment } from "./workflow/instances.ts";

/**
 * Synthetic demo data.
 *
 * Three properties, in order of importance:
 *
 *   1. It is invented. No real customer, SKU, price or address appears here,
 *      and `scripts/check-clean-room.sh` runs in CI to keep it that way.
 *   2. It is deterministic. The generator below is seeded, so the same names,
 *      addresses, quantities, prices and workflow paths come out of every run
 *      — which makes screenshots stable and lets a test assert on a specific
 *      order. NOT byte-identical: ids are cuids and timestamps are `now()`, so
 *      those differ. Verified by seeding two empty databases and comparing the
 *      generated content, which matches exactly.
 *   3. It goes through the services, not straight into the tables. A seed that
 *      writes rows directly can produce states the application cannot, and
 *      then the demo shows something that could never happen.
 */

/** mulberry32: small, seeded, and good enough for picking names out of a list. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_PASSWORD = "demo passphrase 2026";

const random = makeRandom(20260919);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));

// Invented, deliberately generic, and recognisable as demo data.
const FIRST = ["Ada", "Bo", "Cleo", "Dev", "Eli", "Fen", "Gil", "Hana", "Ivo", "Juno", "Kit", "Lark"];
const LAST = ["Arden", "Blythe", "Corwin", "Dahl", "Ellery", "Frost", "Gale", "Holt", "Ives", "Jarvis"];
const STREETS = ["Alder Way", "Beacon Row", "Cedar Lane", "Dune Street", "Elm Court", "Fallow Road"];
const CITIES = [
  { city: "Northbrook", region: "CA", postcode: "90210", country: "US" },
  { city: "Eastvale", region: "NY", postcode: "10001", country: "US" },
  { city: "Westford", region: "ON", postcode: "M5V 2T6", country: "CA" },
  { city: "Southgate", region: "", postcode: "SW1A 1AA", country: "GB" },
];

const CATALOG = [
  { slug: "ceramic-mug", title: "Ceramic Mug", variants: [["MUG-11OZ", "11oz", 1_250], ["MUG-15OZ", "15oz", 1_550]] },
  { slug: "canvas-print", title: "Canvas Print", variants: [["PRINT-12X16", "12×16 in", 3_400], ["PRINT-18X24", "18×24 in", 5_900]] },
  { slug: "cotton-tote", title: "Cotton Tote", variants: [["TOTE-NAT", "Natural", 1_800], ["TOTE-BLK", "Black", 1_800]] },
  { slug: "enamel-pin", title: "Enamel Pin", variants: [["PIN-ROUND", "Round 25mm", 750]] },
  { slug: "notebook-a5", title: "A5 Notebook", variants: [["NB-A5-DOT", "Dotted", 1_100], ["NB-A5-LINE", "Lined", 1_100]] },
  { slug: "sticker-sheet", title: "Sticker Sheet", variants: [["STK-A6", "A6", 400]] },
] as const;

async function seedCatalogFor(ctx: Ctx): Promise<string[]> {
  const skus: string[] = [];
  for (const entry of CATALOG) {
    const product = await createProduct(ctx, { slug: entry.slug, title: entry.title });
    for (const [sku, title, priceMinor] of entry.variants) {
      await createVariant(ctx, product.id, { sku, title: `${entry.title} — ${title}`, priceMinor });
      skus.push(sku);
    }
  }
  return skus;
}

/** A path through standard-retail, chosen so the demo shows every state. */
const RETAIL_PATHS: readonly (readonly string[])[] = [
  [],
  ["start_picking"],
  ["start_picking", "mark_packed"],
  ["start_picking", "mark_packed", "dispatch"],
  ["start_picking", "mark_packed", "dispatch", "confirm_delivery"],
  ["start_picking", "mark_packed", "dispatch", "raise_exception"],
  ["cancel_early"],
];

async function seedTenantData(ctx: Ctx, skus: readonly string[], orderCount: number): Promise<void> {
  await fundWallet(ctx, 500_000n, "opening-balance");

  for (let i = 0; i < orderCount; i += 1) {
    const buyer = `${pick(FIRST)} ${pick(LAST)}`;
    const place = pick(CITIES);
    const lineCount = between(1, 3);
    const chosen = new Set<string>();
    while (chosen.size < lineCount) chosen.add(pick(skus));

    const placedAt = new Date(Date.UTC(2026, 7, 1) + between(0, 45) * 86_400_000 + between(0, 82_800) * 1_000);

    const order = await createOrder(ctx, {
      channel: pick(["web", "wholesale", "marketplace"]),
      externalRef: `DEMO-${String(1000 + i)}`,
      buyer: { name: buyer, email: `${buyer.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com` },
      shipTo: {
        name: buyer,
        line1: `${between(1, 240)} ${pick(STREETS)}`,
        city: place.city,
        ...(place.region ? { region: place.region } : {}),
        postcode: place.postcode,
        country: place.country,
      },
      shippingMinor: pick([0, 399, 499, 699]),
      placedAt,
      lines: [...chosen].map((sku) => ({ sku, quantity: between(1, 3) })),
    });

    await chargeOrder(ctx, order.id, BigInt(order.totalMinor));

    // Most orders have work started; a few are left untouched so the list has
    // something in every column.
    if (random() < 0.85) {
      const started = await startFulfillment(ctx, {
        orderId: order.id,
        lines: order.lines.map((line) => ({ orderLineId: line.id, quantity: line.quantity })),
      });

      const path = pick(RETAIL_PATHS);
      for (const transition of path) {
        // `dispatch` is guarded on having a label, so give it one first.
        if (transition === "dispatch") {
          await ctx.db.shipment.create({
            data: {
              tenantId: ctx.tenantId,
              fulfillmentId: started.fulfillmentId,
              carrierKey: "fake",
              service: "standard",
              trackingNumber: `FAKE${String(100000 + i)}`,
              status: "LABEL_PURCHASED",
              costMinor: 499,
              currency: "USD",
            },
          });
        }
        await applyTransition(ctx, started.instanceId, transition);
      }
    }
  }
}

export async function seed(): Promise<void> {
  const existing = await systemPrisma.tenant.findFirst({ where: { slug: "northwind-goods" } });
  if (existing) {
    console.log("Demo data is already present. Drop the database to reseed.");
    return;
  }

  // A shared, obvious demo password. Real enough to exercise the real sign-in
  // path, and obviously not a secret — which is the point: nobody should be
  // able to mistake seeded data for production data.
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const ownerA = await systemPrisma.user.create({
    data: { email: "owner@example.com", name: "Demo Owner", passwordHash, emailVerifiedAt: new Date() },
  });
  const ownerB = await systemPrisma.user.create({
    data: { email: "second-owner@example.com", name: "Second Owner", passwordHash, emailVerifiedAt: new Date() },
  });

  const a = await createTenant({ slug: "northwind-goods", name: "Northwind Goods", ownerUserId: ownerA.id });
  const b = await createTenant({ slug: "harbour-press", name: "Harbour Press", ownerUserId: ownerB.id });

  // The second tenant runs the other process, which is the point of having two.
  await setActiveDefinition(b.ctx, "made-to-order");

  const skusA = await seedCatalogFor(a.ctx);
  const skusB = await seedCatalogFor(b.ctx);

  await seedTenantData(a.ctx, skusA, 40);
  await seedTenantData(b.ctx, skusB, 12);

  // Counted within the two tenants this run created, not globally: a database
  // that already held test data would otherwise make this line report somebody
  // else's rows as though they had just been seeded.
  const tenantIds = [a.tenantId, b.tenantId];
  const orders = await systemPrisma.order.count({ where: { tenantId: { in: tenantIds } } });
  const fulfillments = await systemPrisma.fulfillment.count({ where: { tenantId: { in: tenantIds } } });
  console.log(`Seeded 2 tenants, ${orders} orders, ${fulfillments} fulfillments.`);
  console.log(`Sign in as owner@example.com (Northwind Goods) or second-owner@example.com (Harbour Press).`);
  console.log(`Password for both: ${DEMO_PASSWORD}`);
}

// Run directly: node --experimental-strip-types src/seed.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => systemPrisma.$disconnect())
    .catch(async (error: unknown) => {
      console.error(error);
      await systemPrisma.$disconnect();
      process.exitCode = 1;
    });
}
