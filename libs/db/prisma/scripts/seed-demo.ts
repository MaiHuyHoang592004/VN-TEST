/**
 * Demo data for looking at the app — the FULL system, ~600+ rows.
 *
 * Everything here exists so a human can SEE every page in every state it has:
 * a busy orders table across 60 days, wallets with real ledgers, unread bells,
 * ticket threads, receipts half-received, BOMs with an incomplete line, a
 * shortage on the stock page. Nothing renders convincingly against an empty
 * table, and "it looks fine" against three hand-made rows is how a layout
 * that breaks on real data ships.
 *
 * WHAT IT CREATES (all marked, all removable):
 *   · ensures niyamvora@gmail.com exists with the ADMIN role (never touches
 *     its password; Google login links by email — allowDangerousEmailAccount-
 *     Linking is on in libs/auth)
 *   · 4 seller accounts + 3 customer/support staff, password "demo1234",
 *     all under @demo.gwprint.dev
 *   · 8 products / 24 SKUs with tier prices, real Unsplash photography
 *   · ~150 parcels → ~230 orders across all 8 statuses over 60 days,
 *     shipments, proof photos, baskets
 *   · per-seller money ledgers (top-ups, order payments, a refund, a pending
 *     + a rejected request) whose balanceBefore/After actually add up
 *   · ~90 notifications with correct payload keys, ~half read
 *   · 11 tickets with reply threads and photo attachments
 *   · 12 suppliers, stock rows whose movement ledger sums EXACTLY to the
 *     counters, 5 receipts (complete/partial/pending/overdue), reservations
 *   · 5 BOMs (one DRAFT with an unmapped line, on purpose)
 *   · 4 vendors, 6 expense categories, ~36 expense entries
 *   · one API key for the first seller (raw key printed at the end)
 *
 * Safe to run repeatedly: every entity carries a demo marker (DEMO- external
 * ids, DM- skus/codes, "DEMO" notes, @demo.gwprint.dev emails) and the run
 * starts by removing the previous demo rows. `--wipe` removes everything and
 * exits — run that before go-live.
 *
 * LOCAL by default. A remote target (Neon prod) needs BOTH:
 *   ENV_FILE=.env.prod SEED_ALLOW_REMOTE=1 npm run db:seed:demo
 * The env var is deliberate friction — you cannot arrive at it by pressing
 * up-arrow in a shell.
 */
import { createHash } from "node:crypto";
import { prisma } from "../../src/client.ts";
import { Prisma } from "../../src/generated/prisma/client.ts";

const url = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const host = url.replace(/:[^:@/]+@/, ":***@").replace(/\?.*/, "");
const WIPE = process.argv.includes("--wipe");

if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to ${WIPE ? "wipe" : "seed"}: ${host} is not a local database.`);
  console.error("Set SEED_ALLOW_REMOTE=1 if that is genuinely what you want.");
  process.exit(1);
}
if (!isLocal) {
  console.warn(`\n⚠  REMOTE DATABASE: ${host}`);
  console.warn(`⚠  ${WIPE ? "Removing" : "Writing"} DEMO data that real signed-in users will see.\n`);
}

// ── Markers. One list of conventions, used by seed AND wipe: they cannot drift.
const PREFIX = "DEMO-";                 // order externalIds
const DEMO_DOMAIN = "@demo.gwprint.dev"; // every seeded account except the admin
const ADMIN_EMAIL = "niyamvora@gmail.com";
const MAT_PREFIX = "DM-";               // material skus, vendor codes
const NOTE_MARK = "DEMO seed";          // receipts.note, expenses.description prefix
const BOM_MARK = "DEMO ";               // bom names
/** bcrypt("demo1234") — precomputed so libs/db needs no bcrypt dependency. */
const DEMO_PASSWORD_HASH = "$2b$10$xPo2uVoEV2KlxS/1wrY7Ke8.Uw15MmJoTIMmZO4nyFyQ5.7HHPLz.";
const DEMO_API_KEY = "opc_live_demo1234567890abcdefDEMOKEY00";

const DEMO_PRODUCT_KEYS = [
  "ceramic-mug", "dad-cap", "classic-tee", "tote-bag",
  "phone-case", "pullover-hoodie", "leather-wallet", "linen-journal",
];
const DEMO_WAREHOUSES = ["NYC1", "LAX1"];
const DEMO_SHELVES = ["A", "B"];

/** Real photographs (each URL was fetched and checked for a 200 when first
 * written down). Hotlinked from Unsplash's CDN, not committed: demo rows get
 * wiped before go-live. */
const IMG = (id: string, w = 600) =>
  `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`;
const PARCEL_PHOTOS = [
  IMG("photo-1607083206869-4c7672e72a8a", 800),
  IMG("photo-1586528116311-ad8dd3c8310d", 800),
  IMG("photo-1595246140625-573b715d11dc", 800),
];
/** Bank-slip-looking photos for money evidence and dock photos for receipts. */
const RECEIPT_PHOTOS = [IMG("photo-1554224155-6726b3ff858f", 800), IMG("photo-1450101499163-c8848c66ca85", 800)];
const DOCK_PHOTOS = [IMG("photo-1586528116022-aeda1613c63d", 800), IMG("photo-1553413077-190dd305871c", 800)];
/** A real, stable public PDF so "Open label" opens something. */
const LABEL_PDF = "https://pdfobject.com/pdf/sample.pdf";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600_000);
const tracking = (n: number) => `9400111899223197${String(428400 + n).padStart(6, "0")}`;
const D = (v: string | number) => new Prisma.Decimal(typeof v === "number" ? v.toFixed(2) : v);

/** Deterministic PRNG (mulberry32) — re-runs produce the same world. */
let seedState = 42;
const rand = () => {
  seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const evidence = (url: string, filename: string, uploadedById?: string) => [{
  url, key: `demo/${filename}`, filename, originalFilename: filename,
  mimeType: "image/jpeg", size: 245_000, uploadedAt: ago(between(1, 20)).toISOString(),
  ...(uploadedById ? { uploadedById } : {}),
}];

// ─────────────────────────────────────────────────────────────────────────────
// WIPE — removes everything the seed creates, in FK-safe order. Also runs at
// the START of a normal seed, which is what makes re-running safe.
// ─────────────────────────────────────────────────────────────────────────────
async function wipe(loud = true) {
  const say = (s: string) => loud && console.log(s);

  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);

  const orders = await prisma.order.findMany({
    where: { externalId: { startsWith: PREFIX } },
    select: { id: true, shippingAddressId: true },
  });
  const orderIds = orders.map((o) => o.id);

  // Bells: anything sent to a demo account, plus prefix-keyed ones sent to the
  // admin (their account is real and survives — only the demo noise goes).
  await prisma.notification.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.notification.deleteMany({ where: { data: { path: ["externalId"], string_starts_with: PREFIX } } });
  await prisma.notification.deleteMany({ where: { data: { path: ["demo"], equals: "1" } } });

  await prisma.ticketReply.deleteMany({ where: { ticket: { authorId: { in: demoUserIds } } } });
  await prisma.ticket.deleteMany({ where: { authorId: { in: demoUserIds } } });
  await prisma.transaction.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.transaction.deleteMany({ where: { metadata: { path: ["demo"], equals: true } } });
  await prisma.apiKey.deleteMany({ where: { prefix: DEMO_API_KEY.slice(0, 16) } });

  // Inventory paper trail before the things it points at.
  await prisma.inventoryReservation.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryMovement.deleteMany({
    where: { OR: [{ material: { sku: { startsWith: MAT_PREFIX } } }, { note: NOTE_MARK }] },
  });
  await prisma.stockReceipt.deleteMany({ where: { note: NOTE_MARK } }); // shipments+lines cascade
  await prisma.materialStock.deleteMany({ where: { material: { sku: { startsWith: MAT_PREFIX } } } });
  await prisma.bom.deleteMany({ where: { name: { startsWith: BOM_MARK } } }); // lines cascade
  await prisma.material.deleteMany({ where: { sku: { startsWith: MAT_PREFIX } } });

  await prisma.expenseEntry.deleteMany({ where: { description: { startsWith: NOTE_MARK } } });
  const cats = await prisma.expenseCategory.findMany({ select: { id: true, _count: { select: { entries: true } } } });
  await prisma.expenseCategory.deleteMany({
    where: { id: { in: cats.filter((c) => c._count.entries === 0).map((c) => c.id) }, note: NOTE_MARK },
  });
  await prisma.vendor.deleteMany({
    where: { code: { startsWith: MAT_PREFIX }, shipments: { none: {} }, expenses: { none: {} } },
  });

  await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.address.deleteMany({
    where: { id: { in: orders.map((o) => o.shippingAddressId).filter((x): x is number => x !== null) } },
  });
  say(`→ removed ${orderIds.length} demo orders`);

  await prisma.basketPosition.deleteMany({ where: { shelfName: { in: DEMO_SHELVES } } });

  for (const key of DEMO_PRODUCT_KEYS) {
    const product = await prisma.product.findUnique({
      where: { key },
      select: { id: true, _count: { select: { orders: true } }, variants: { select: { id: true } } },
    });
    if (!product) continue;
    if (product._count.orders > 0) { say(`→ KEPT product ${key}: non-demo orders reference it`); continue; }
    const skuIds = product.variants.map((v) => v.id);
    await prisma.inventoryMovement.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.inventoryReservation.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.warehouseInventory.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.stockReceiptLine.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.bom.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } }); // VariantPrice cascades
    await prisma.product.delete({ where: { id: product.id } });
  }
  await prisma.mockup.deleteMany({ where: { name: { endsWith: "— demo" } } });

  for (const code of DEMO_WAREHOUSES) {
    const wh = await prisma.warehouse.findUnique({ where: { code }, select: { id: true } });
    if (!wh) continue;
    await prisma.materialStock.deleteMany({ where: { warehouseId: wh.id } });
    // Deletable only when NOTHING references it any more. Non-demo data (a
    // smoke-test order, inventory of a KEPT product) legitimately survives the
    // demo wipe — the warehouse then stays too, instead of an FK crash that
    // aborts the whole wipe halfway (learned the hard way on the second run).
    const usage = {
      orders: await prisma.order.count({ where: { warehouseId: wh.id } }),
      inventory: await prisma.warehouseInventory.count({ where: { warehouseId: wh.id } }),
      receipts: await prisma.stockReceipt.count({ where: { warehouseId: wh.id } }),
      movements: await prisma.inventoryMovement.count({ where: { warehouseId: wh.id } }),
      reservations: await prisma.inventoryReservation.count({ where: { warehouseId: wh.id } }),
    };
    const blockers = Object.entries(usage).filter(([, n]) => n > 0);
    if (blockers.length) {
      say(`→ KEPT customer ${code}: still referenced (${blockers.map(([k, n]) => `${n} ${k}`).join(", ")})`);
      continue;
    }
    await prisma.warehouseMember.deleteMany({ where: { warehouseId: wh.id } });
    try {
      await prisma.warehouse.delete({ where: { id: wh.id } });
    } catch {
      say(`→ KEPT customer ${code}: something referenced it mid-wipe`);
    }
  }

  // Accounts last: nothing above references them any more. The ADMIN is real
  // and is never deleted — only demo-domain accounts go.
  await prisma.warehouseMember.deleteMany({ where: { userId: { in: demoUserIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: demoUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } });
  say(`→ removed ${demoUserIds.length} demo accounts`);
  say("\nDemo data removed.");
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  if (WIPE) return wipe();
  console.log("→ clearing any previous demo data first");
  await wipe(false);

  // ── People ────────────────────────────────────────────────────────────────
  // The real admin: ensured, never overwritten. No password is ever set on a
  // real account — Google links by email (allowDangerousEmailAccountLinking).
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const admin = existingAdmin
    ? await prisma.user.update({
        where: { email: ADMIN_EMAIL },
        data: {
          roles: { set: Array.from(new Set([...existingAdmin.roles, "ADMIN" as const])) },
          status: "ACTIVE",
        },
      })
    : await prisma.user.create({
        data: { email: ADMIN_EMAIL, name: "Niyam Vora", roles: ["ADMIN"], status: "ACTIVE", emailVerified: new Date() },
      });
  console.log(`→ admin ensured: ${ADMIN_EMAIL}${existingAdmin ? " (existing account, roles topped up)" : " (created — sign in with Google)"}`);

  const mkUser = (email: string, name: string, roles: string[], extra: object = {}) =>
    prisma.user.upsert({
      where: { email: `${email}${DEMO_DOMAIN}` },
      update: {},
      create: {
        email: `${email}${DEMO_DOMAIN}`, name, roles: roles as never, status: "ACTIVE",
        passwordHash: DEMO_PASSWORD_HASH, emailVerified: new Date(),
        lastLoginAt: ago(between(0, 5)), ...extra,
      },
    });

  const sellers = [
    await mkUser("maya", "Maya Tran", ["SELLER"], { companyName: "Maya's Craft Co", tier: 1, locale: "en", phone: "+1 917 555 0141" }),
    await mkUser("leo", "Leo Nguyen", ["SELLER"], { companyName: "Leo Prints", tier: 2, locale: "vi", phone: "+84 90 555 0122" }),
    await mkUser("sofia", "Sofia Reyes", ["SELLER"], { companyName: "Sofia Studio", tier: 1, locale: "en", phone: "+1 213 555 0177" }),
    await mkUser("kenji", "Kenji Sato", ["SELLER"], { companyName: "Kenji Goods", tier: 2, locale: "ja", phone: "+81 80 5550 1963" }),
  ];
  const dana = await mkUser("dana", "Dana Kowalski", ["WAREHOUSE_ADMIN"]);
  const rosa = await mkUser("rosa", "Rosa Marquez", ["WAREHOUSE"]);
  const tom = await mkUser("tom", "Tom Okafor", ["WAREHOUSE"]);
  const sam = await mkUser("sam", "Sam Patel", ["SUPPORT"]);
  console.log(`→ ${sellers.length} sellers + 4 staff (password: demo1234)`);

  // REAL seller accounts get data too. On prod the point of the demo is that
  // the people who sign in with Google (the owner, Ken, Mai) see a full
  // dashboard of their own — not four strangers' shops. Their accounts are
  // never modified (no password, no roles); they just join the pool that
  // orders, ledgers and bells are spread across. Their demo rows carry the
  // same markers, so --wipe removes the data and leaves the accounts.
  const realSellers = await prisma.user.findMany({
    where: { roles: { has: "SELLER" }, deletedAt: null, NOT: { email: { endsWith: DEMO_DOMAIN } } },
  });
  const sellerPool = [...sellers, ...realSellers];
  if (realSellers.length) {
    console.log(`→ real seller accounts joining the pool: ${realSellers.map((s) => s.email).join(", ")}`);
  }

  // One working API key for the first seller, so /api/v1 can be demoed live.
  await prisma.apiKey.create({
    data: {
      userId: sellers[0].id, name: "Demo integration",
      keyHash: createHash("sha256").update(DEMO_API_KEY).digest("hex"),
      prefix: DEMO_API_KEY.slice(0, 16),
    },
  });

  // ── Sites, shelves, staff assignments ─────────────────────────────────────
  const nyc = await prisma.warehouse.upsert({
    where: { code: "NYC1" }, update: {},
    create: { code: "NYC1", name: "New York Fulfillment", timezone: "America/New_York", status: "ACTIVE" },
  });
  const lax = await prisma.warehouse.upsert({
    where: { code: "LAX1" }, update: {},
    create: { code: "LAX1", name: "Los Angeles Fulfillment", timezone: "America/Los_Angeles", status: "ACTIVE" },
  });
  for (const [shelf, wh] of [["A", nyc], ["B", lax]] as const) {
    for (const column of ["A", "B", "C", "D", "E", "F"]) {
      await prisma.basketPosition.create({
        data: { shelfName: shelf, row: 1, column, name: `${shelf}1${column}`, status: "AVAILABLE" },
      });
    }
  }
  const membership: Array<[string, number, boolean]> = [
    [admin.id, nyc.id, true], [admin.id, lax.id, false],
    [dana.id, nyc.id, true], [dana.id, lax.id, false],
    [rosa.id, nyc.id, true], [tom.id, lax.id, true],
  ];
  for (const [userId, warehouseId, isPrimary] of membership) {
    await prisma.warehouseMember.upsert({
      where: { userId_warehouseId: { userId, warehouseId } },
      update: { isPrimary }, create: { userId, warehouseId, isPrimary },
    });
  }
  console.log("→ warehouses NYC1 + LAX1, 12 baskets, staff assigned");

  // ── Catalogue: 8 products, per-variant variants, tier prices ──────────────
  const products = [
    { key: "ceramic-mug", name: "Ceramic Mug 11oz", price: 18, variants: [["White", "white"], ["Black", "black"], ["Two-Tone Blue", "two-tone-blue"]],
      image: IMG("photo-1514228742587-6b1558fcca3d"), alt: IMG("photo-1517256064527-09c73fc73e38"),
      parcel: { single: { length: 6, width: 5, height: 5, weight: 22 }, multiple: { length: 12, width: 10, height: 6, weight: 22 } } },
    { key: "dad-cap", name: "Embroidered Dad Cap", price: 22, variants: [["Stone", "stone"], ["Navy", "navy"], ["Black", "cap-black"]],
      image: IMG("photo-1588850561407-ed78c282e89b"), alt: IMG("photo-1521369909029-2afed882baee"),
      parcel: { single: { length: 10, width: 8, height: 5, weight: 5 }, multiple: { length: 14, width: 11, height: 8, weight: 5 } } },
    { key: "classic-tee", name: "Classic Cotton Tee", price: 24, variants: [["White / M", "tee-white-m"], ["Black / L", "tee-black-l"], ["Heather / XL", "tee-heather-xl"]],
      image: IMG("photo-1521572163474-6864f9cf17ab"), alt: IMG("photo-1503341504253-dff4815485f1"),
      parcel: { single: { length: 12, width: 9, height: 2, weight: 7 }, multiple: { length: 14, width: 11, height: 4, weight: 7 } } },
    { key: "tote-bag", name: "Canvas Tote Bag", price: 20, variants: [["Natural", "natural"], ["Black", "tote-black"], ["Olive", "olive"]],
      image: IMG("photo-1544816155-12df9643f363"), alt: IMG("photo-1544816155-12df9643f363"),
      parcel: { single: { length: 12, width: 9, height: 2, weight: 9 }, multiple: { length: 14, width: 11, height: 5, weight: 9 } } },
    { key: "phone-case", name: "Snap Phone Case", price: 16, variants: [["iPhone 15", "iphone-15"], ["iPhone 15 Pro", "iphone-15-pro"], ["Pixel 8", "pixel-8"]],
      image: IMG("photo-1616348436168-de43ad0db179"), alt: IMG("photo-1616348436168-de43ad0db179"),
      parcel: { single: { length: 7, width: 4, height: 1, weight: 3 }, multiple: { length: 9, width: 6, height: 3, weight: 3 } } },
    { key: "pullover-hoodie", name: "Heavyweight Hoodie", price: 42, variants: [["Black / M", "hood-black-m"], ["Sand / L", "hood-sand-l"], ["Forest / XL", "hood-forest-xl"]],
      image: IMG("photo-1556821840-3a63f95609a7"), alt: IMG("photo-1620799140408-edc6dcb6d633"),
      parcel: { single: { length: 14, width: 11, height: 4, weight: 24 }, multiple: { length: 16, width: 13, height: 8, weight: 24 } } },
    { key: "leather-wallet", name: "Leather Bifold Wallet", price: 34, variants: [["Tan", "wallet-tan"], ["Brown", "wallet-brown"], ["Black", "wallet-black"]],
      image: IMG("photo-1627123424574-724758594e93"), alt: IMG("photo-1553062407-98eeb64c6a62"),
      parcel: { single: { length: 6, width: 4, height: 2, weight: 6 }, multiple: { length: 10, width: 8, height: 4, weight: 6 } } },
    { key: "linen-journal", name: "Linen Journal A5", price: 19, variants: [["Sage", "journal-sage"], ["Charcoal", "journal-charcoal"], ["Rust", "journal-rust"]],
      image: IMG("photo-1531346878377-a5be20888e57"), alt: IMG("photo-1517842645767-c639042777db"),
      parcel: { single: { length: 9, width: 6, height: 1, weight: 12 }, multiple: { length: 12, width: 9, height: 4, weight: 12 } } },
  ];

  const mockupByProduct = new Map<string, number>();
  for (const p of products) {
    const mockup = await prisma.mockup.create({
      data: { name: `${p.name} — demo`, url: p.image, thumbnail: IMG(p.image.split("/").pop()!.split("?")[0], 160) },
      select: { id: true },
    });
    mockupByProduct.set(p.key, mockup.id);
  }

  type Sku = { id: number; productId: number; variantId: number; product: string; key: string; mockupId: number; image: string; price: number };
  const skus: Sku[] = [];
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { key: p.key },
      update: { configs: { parcel: { ...p.parcel, distanceUnit: "in", massUnit: "oz" } }, thumbnail: p.image },
      create: { key: p.key, name: p.name, status: "ACTIVE", thumbnail: p.image,
        configs: { parcel: { ...p.parcel, distanceUnit: "in", massUnit: "oz" } } },
    });
    for (const [name, key] of p.variants) {
      const variant = await prisma.variant.upsert({ where: { key }, update: {}, create: { key, name } });
      const existing = await prisma.productVariant.findFirst({
        where: { productId: product.id, variantId: variant.id }, select: { id: true },
      });
      const row = existing ?? (await prisma.productVariant.create({
        data: { productId: product.id, variantId: variant.id,
          sku: `${p.key.slice(0, 3).toUpperCase()}-${key.replace(/[^a-z0-9]+/gi, "").toUpperCase()}`,
          salePrice: D(p.price), status: "ACTIVE" },
        select: { id: true },
      }));
      // Tier prices: 0 = public, 1 = −10%, 2 = −15%. What assignment charges.
      for (const [tier, mult] of [[0, 1], [1, 0.9], [2, 0.85]] as const) {
        await prisma.variantPrice.upsert({
          where: { productVariantId_tier: { productVariantId: row.id, tier } },
          update: { price: D(p.price * mult) },
          create: { productVariantId: row.id, tier, price: D(p.price * mult) },
        });
      }
      skus.push({ id: row.id, productId: product.id, variantId: variant.id, product: p.name, key: p.key,
        mockupId: mockupByProduct.get(p.key)!, image: p.alt, price: p.price });
    }
  }
  console.log(`→ ${products.length} products, ${skus.length} SKUs, ${skus.length * 3} tier prices`);

  // ── Orders: ~150 parcels over 60 days ─────────────────────────────────────
  const FIRST = ["Ava", "Ben", "Chloe", "Daniel", "Elena", "Felix", "Grace", "Hugo", "Iris", "Jonah",
    "Kira", "Leo", "Mara", "Noah", "Olive", "Pete", "Quinn", "Ruth", "Seth", "Tara", "Uma", "Vik", "Wren", "Yara", "Zane"];
  const LAST = ["Mitchell", "Carter", "Diaz", "Fox", "Gomez", "Hart", "Iyer", "Klein", "Lawson", "Park",
    "Novak", "Rossi", "Singh", "Tanaka", "Ueda", "Vega", "Walsh", "Young", "Zhou", "Ellis"];
  const CITIES: Array<[string, string, string]> = [
    ["New York", "NY", "10012"], ["Austin", "TX", "78701"], ["Los Angeles", "CA", "90028"],
    ["Boston", "MA", "02108"], ["Seattle", "WA", "98101"], ["Chicago", "IL", "60611"],
    ["San Francisco", "CA", "94103"], ["Atlanta", "GA", "30303"], ["Miami", "FL", "33139"],
    ["Denver", "CO", "80202"], ["Portland", "OR", "97204"], ["Nashville", "TN", "37201"],
  ];
  const MARKETPLACES = ["Etsy", "Amazon", "Shopify", "eBay"];
  const STATUS_PLAN: Array<["PENDING" | "ASSIGNED" | "IN_PRODUCTION" | "FULFILLED" | "SHIPPED" | "DELIVERED" | "ON_HOLD" | "CANCELLED", number, [number, number]]> = [
    ["PENDING", 22, [0, 2]], ["ASSIGNED", 25, [1, 4]], ["IN_PRODUCTION", 22, [1, 6]],
    ["FULFILLED", 18, [2, 8]], ["SHIPPED", 25, [3, 20]], ["DELIVERED", 30, [6, 60]],
    ["ON_HOLD", 5, [1, 10]], ["CANCELLED", 8, [2, 30]],
  ];
  const HOLD_REASONS = ["Address looks incomplete — warehouse queried", "Design file missing", "Awaiting seller confirmation", "Wrong label on file"];
  const past = (s: string) => ["ASSIGNED", "IN_PRODUCTION", "FULFILLED", "SHIPPED", "DELIVERED"].includes(s);

  type SeededParcel = { sellerId: string; status: string; total: number; placedAt: Date; externalId: string; trackingNumber?: string; orderIds: number[]; warehouseId: number | null; qty: number };
  const seededParcels: SeededParcel[] = [];
  const occupiedBaskets = ["A1A", "A1B", "B1A"];
  let basketUsed = 0;
  let parcelIndex = 0;
  let orderCount = 0;

  for (const [status, count, [minD, maxD]] of STATUS_PLAN) {
    for (let i = 0; i < count; i++) {
      parcelIndex++;
      const seller = sellerPool[parcelIndex % sellerPool.length];
      const tierMult = seller.tier === 2 ? 0.85 : 0.9;
      const days = between(minD, maxD);
      const placedAt = ago(days, between(0, 20));
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const [city, state, zip] = pick(CITIES);
      const warehouseId = past(status) || status === "ON_HOLD" ? (parcelIndex % 3 === 0 ? lax.id : nyc.id) : null;
      const pieces = rand() < 0.6 ? 1 : rand() < 0.75 ? 2 : 3;
      const withLabel = ["FULFILLED", "SHIPPED", "DELIVERED"].includes(status);
      const trackingNumber = withLabel || status === "IN_PRODUCTION" ? tracking(parcelIndex) : undefined;

      const address = await prisma.address.create({
        data: { name, line1: `${between(1, 980)} ${pick(["Oak", "Pine", "Cedar", "Market", "Union", "Sunset", "Beacon", "Canal"])} ${pick(["St", "Ave", "Blvd", "Rd"])}`,
          city, state, zip, country: "US", email: `${name.split(" ")[0].toLowerCase()}${between(2, 99)}@example.com` },
        select: { id: true },
      });

      // A few mid-production parcels sit in baskets so the station shows them.
      let basketId: number | null = null;
      if (status === "IN_PRODUCTION" && pieces > 1 && basketUsed < occupiedBaskets.length) {
        const basket = await prisma.basketPosition.findFirst({ where: { name: occupiedBaskets[basketUsed++] } });
        if (basket) {
          await prisma.basketPosition.update({ where: { id: basket.id }, data: { status: "OCCUPIED", trackingNumber: trackingNumber ?? null } });
          basketId = basket.id;
        }
      }

      let parcelTotal = 0;
      const orderIds: number[] = [];
      let parcelQty = 0;
      for (let pieceIndex = 0; pieceIndex < pieces; pieceIndex++) {
        const sku = skus[(parcelIndex * 3 + pieceIndex) % skus.length];
        const quantity = rand() < 0.75 ? 1 : between(2, 4);
        parcelQty += quantity;
        const unit = sku.price * tierMult;
        const cost = past(status) ? unit * quantity : 0;
        parcelTotal += cost;
        const filled = status === "IN_PRODUCTION" ? between(0, quantity)
          : ["FULFILLED", "SHIPPED", "DELIVERED"].includes(status) ? quantity : 0;

        const order = await prisma.order.create({
          data: {
            externalId: `${PREFIX}${1000 + parcelIndex}-${pieceIndex + 1}`,
            marketplace: pick(MARKETPLACES), source: "seed",
            customerId: seller.id, warehouseId,
            productId: sku.productId, variantId: sku.variantId, productVariantId: sku.id,
            mockupId: sku.mockupId, shippingAddressId: address.id, basketPositionId: basketId,
            quantity, filled, status: status as never, placedAt,
            assignedAt: past(status) ? new Date(placedAt.getTime() + 3600_000) : null,
            fulfilledAt: ["FULFILLED", "SHIPPED", "DELIVERED"].includes(status) ? new Date(placedAt.getTime() + 8 * 3600_000) : null,
            deadline: status === "ON_HOLD" || rand() < 0.15 ? new Date(placedAt.getTime() + 7 * DAY) : null,
            paid: past(status),
            baseCost: past(status) ? D(unit * quantity) : null,
            note: pieceIndex === 0 && rand() < 0.2 ? pick(["Gift wrap requested", "Rush — warehouse chasing", "Include thank-you card", null as never]) : null,
            internalNote: status === "ON_HOLD" ? "Waiting on the seller to confirm" : null,
            imageUrl: sku.image,
            proofImageUrl: ["FULFILLED", "SHIPPED", "DELIVERED"].includes(status) ? PARCEL_PHOTOS[parcelIndex % PARCEL_PHOTOS.length] : null,
          },
          select: { id: true },
        });
        orderIds.push(order.id);
        orderCount++;

        if (withLabel) {
          await prisma.shipment.create({
            data: { orderId: order.id, trackingNumber: trackingNumber!, labelUrl: LABEL_PDF,
              provider: "usps", method: "usps_ground_advantage", cost: D(4.85),
              trackingStatus: status === "DELIVERED" ? "delivered" : status === "SHIPPED" ? "in_transit" : "CREATED",
              shippedAt: ["SHIPPED", "DELIVERED"].includes(status) ? new Date(placedAt.getTime() + 26 * 3600_000) : null,
              configs: { demo: true } },
          });
        }
      }
      seededParcels.push({ sellerId: seller.id, status, total: parcelTotal, placedAt,
        externalId: `${PREFIX}${1000 + parcelIndex}`, trackingNumber, orderIds, warehouseId, qty: parcelQty });
    }
  }
  console.log(`→ ${seededParcels.length} parcels, ${orderCount} orders, shipments + proof photos`);

  // ── Money: a coherent ledger per seller ───────────────────────────────────
  // Events (top-ups + charges + one refund) are sorted by time and replayed so
  // balanceBefore/After genuinely add up and User.balance equals the last column.
  let txnCount = 0;
  for (const seller of sellerPool) {
    type Ev = { at: Date; kind: "TOPUP" | "CHARGE" | "REFUND"; amount: number; parcel?: SeededParcel };
    const events: Ev[] = [];
    for (let i = 0; i < between(3, 5); i++) {
      events.push({ at: ago(between(5, 58), between(0, 20)), kind: "TOPUP", amount: pick([300, 500, 750, 1000, 1500]) });
    }
    const mine = seededParcels.filter((p) => p.sellerId === seller.id && p.total > 0);
    for (const p of mine) events.push({ at: new Date(p.placedAt.getTime() + 3600_000), kind: "CHARGE", amount: p.total, parcel: p });
    const cancelled = seededParcels.find((p) => p.sellerId === seller.id && p.status === "CANCELLED");
    if (cancelled) events.push({ at: ago(between(1, 4)), kind: "REFUND", amount: 25 + Math.round(rand() * 30) });
    events.sort((a, b) => a.at.getTime() - b.at.getTime());

    let balance = 0;
    for (const ev of events) {
      // Never let a charge overdraw the demo wallet: quietly top up first, the
      // way a real seller would have had to.
      if (ev.kind === "CHARGE" && balance < ev.amount) {
        const cover = Math.ceil((ev.amount - balance + 200) / 100) * 100;
        await prisma.transaction.create({
          data: { userId: seller.id, type: "TOPUP", status: "COMPLETED", amount: D(cover),
            paymentMethod: "Bank Transfer", description: "Wallet top-up",
            balanceBefore: D(balance), balanceAfter: D(balance + cover),
            metadata: { demo: true }, createdAt: new Date(ev.at.getTime() - 1800_000) },
        });
        balance += cover; txnCount++;
      }
      const before = balance;
      balance += ev.kind === "CHARGE" ? -ev.amount : ev.amount;
      await prisma.transaction.create({
        data: {
          userId: seller.id,
          type: ev.kind === "CHARGE" ? "ORDER_PAYMENT" : ev.kind, status: "COMPLETED",
          amount: D(ev.kind === "CHARGE" ? -ev.amount : ev.amount),
          paymentMethod: ev.kind === "TOPUP" ? pick(["Bank Transfer", "Credit Card"]) : null,
          description: ev.kind === "CHARGE" ? `Production charge — parcel ${ev.parcel!.externalId}` :
            ev.kind === "REFUND" ? "Refund for cancelled order" : "Wallet top-up",
          balanceBefore: D(before), balanceAfter: D(balance),
          metadata: { demo: true },
          idempotencyKey: ev.kind === "CHARGE" ? `demo:assign:${ev.parcel!.externalId}:${seller.id}` : null,
          createdAt: ev.at,
        },
      });
      txnCount++;
    }
    // One PENDING top-up request (with a bank-slip photo) and one REJECTED —
    // the approve queue and the rejected state both need something to show.
    await prisma.transaction.create({
      data: { userId: seller.id, type: "TOPUP", status: "PENDING", amount: D(pick([250, 400, 600])),
        paymentMethod: "Bank Transfer", description: "Wallet top-up", note: "Transferred this morning",
        evidence: evidence(RECEIPT_PHOTOS[0], "bank-slip.jpg", seller.id),
        metadata: { demo: true }, createdAt: ago(0, between(1, 9)) },
    });
    await prisma.transaction.create({
      data: { userId: seller.id, type: "TOPUP", status: "FAILED", amount: D(120),
        paymentMethod: "Bank Transfer", description: "Wallet top-up",
        note: "Rejected: transfer reference did not match",
        metadata: { demo: true }, createdAt: ago(between(6, 12)) },
    });
    txnCount += 2;
    await prisma.user.update({ where: { id: seller.id }, data: { balance: D(balance) } });
  }
  console.log(`→ ${txnCount} transactions with coherent running balances`);

  // ── Tickets with threads ──────────────────────────────────────────────────
  const TICKET_SEEDS: Array<{ reason: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; title: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" }> = [
    { reason: "wrong-item", priority: "HIGH", title: "Customer received a cap instead of a mug", status: "IN_PROGRESS" },
    { reason: "quality-return", priority: "URGENT", title: "Hoodie print cracked after first wash", status: "OPEN" },
    { reason: "bad-label", priority: "LOW", title: "Label misses apartment number", status: "RESOLVED" },
    { reason: "wrong-address", priority: "URGENT", title: "Buyer moved — parcel going to old address", status: "IN_PROGRESS" },
    { reason: "missing-item", priority: "LOW", title: "Two-piece order arrived with one piece", status: "OPEN" },
    { reason: "other", priority: "MEDIUM", title: "Can we add a gift note to future orders?", status: "CLOSED" },
    { reason: "quality-return", priority: "URGENT", title: "Mug arrived shattered", status: "OPEN" },
    { reason: "bad-label", priority: "LOW", title: "Tracking number not scanning", status: "CLOSED" },
    { reason: "wrong-item", priority: "HIGH", title: "Wrong color tote shipped", status: "RESOLVED" },
    { reason: "other", priority: "MEDIUM", title: "Bulk order enquiry — 200 journals", status: "IN_PROGRESS" },
    { reason: "missing-item", priority: "LOW", title: "Thank-you card missing from parcel", status: "OPEN" },
  ];
  const staffAuthors = [sam, admin];
  let replyCount = 0;
  const ticketRows: Array<{ id: number; authorId: string; title: string; status: string }> = [];
  for (const [i, t] of TICKET_SEEDS.entries()) {
    const seller = sellers[i % sellers.length];
    const parcel = seededParcels.find((p) => p.sellerId === seller.id && p.orderIds.length);
    const createdAt = ago(between(1, 25), between(0, 12));
    const ticket = await prisma.ticket.create({
      data: {
        title: t.title, reason: t.reason, priority: t.priority, status: t.status,
        description: "Opened from the demo seed — see the thread for the conversation.",
        authorId: seller.id, orderId: i % 2 === 0 ? parcel?.orderIds[0] ?? null : null,
        attachments: i % 3 === 0 ? evidence(PARCEL_PHOTOS[i % PARCEL_PHOTOS.length], "issue-photo.jpg", seller.id) : undefined,
        createdAt,
      },
      select: { id: true },
    });
    ticketRows.push({ id: ticket.id, authorId: seller.id, title: t.title, status: t.status });
    const replies = between(1, 4);
    for (let r = 0; r < replies; r++) {
      const fromStaff = r % 2 === 0;
      await prisma.ticketReply.create({
        data: {
          ticketId: ticket.id,
          authorId: fromStaff ? pick(staffAuthors).id : seller.id,
          content: fromStaff
            ? pick(["Thanks for flagging — pulling the proof photo now.", "We've re-queued this for production at no charge.", "Label reprinted, new tracking follows shortly.", "Marking resolved — shout if it recurs."])
            : pick(["Any update on this?", "Customer is asking again, appreciate a quick look.", "That works, thank you!", "Adding another photo from the buyer."]),
          attachments: !fromStaff && r === 1 ? evidence(PARCEL_PHOTOS[(i + 1) % PARCEL_PHOTOS.length], "buyer-photo.jpg", seller.id) : undefined,
          createdAt: new Date(createdAt.getTime() + (r + 1) * between(2, 10) * 3600_000),
        },
      });
      replyCount++;
    }
  }
  console.log(`→ ${TICKET_SEEDS.length} tickets, ${replyCount} replies`);

  // ── Notifications: correct payload keys, ~half read ───────────────────────
  // Payload keys mirror en/notifications.json exactly — wrong keys render "{x}".
  let notifCount = 0;
  const bell = async (userId: string, type: string, data: Record<string, string>, href: string, daysAgo: number, read: boolean) => {
    const createdAt = ago(daysAgo, between(0, 18));
    await prisma.notification.create({
      data: { userId, type: type as never, data: { ...data, demo: "1" }, href, createdAt,
        readAt: read ? new Date(createdAt.getTime() + between(1, 24) * 3600_000) : null },
    });
    notifCount++;
  };
  for (const seller of sellerPool) {
    const mine = seededParcels.filter((p) => p.sellerId === seller.id);
    const shipped = mine.find((p) => p.status === "SHIPPED");
    const delivered = mine.find((p) => p.status === "DELIVERED");
    const onHold = mine.find((p) => p.status === "ON_HOLD");
    const assigned = mine.find((p) => p.status === "ASSIGNED");
    const bal = (await prisma.user.findUnique({ where: { id: seller.id }, select: { balance: true } }))!.balance;
    if (assigned) await bell(seller.id, "ORDER_ASSIGNED", { count: String(assigned.orderIds.length), amount: `$${assigned.total.toFixed(2)}`, balance: `$${bal}` }, "/orders", 1, false);
    if (shipped) await bell(seller.id, "SHIPPING_LABEL_READY", { externalId: `${shipped.externalId}-1`, tracking: shipped.trackingNumber ?? "", provider: "USPS" }, "/orders", 2, rand() < 0.5);
    if (shipped) await bell(seller.id, "ORDER_STATUS_CHANGED", { externalId: `${shipped.externalId}-1`, status: "Shipped" }, "/orders", 2, true);
    if (delivered) await bell(seller.id, "TRACKING_UPDATED", { externalId: `${delivered.externalId}-1`, status: "Delivered", tracking: delivered.trackingNumber ?? "" }, "/orders", between(3, 8), true);
    if (onHold) await bell(seller.id, "ORDER_ON_HOLD", { externalId: `${onHold.externalId}-1`, reason: pick(HOLD_REASONS) }, "/orders", between(1, 5), false);
    await bell(seller.id, "TRANSACTION_APPROVED", { amount: "$500.00", balance: `$${bal}` }, "/profile/billing", between(4, 15), true);
    await bell(seller.id, "TRANSACTION_REJECTED", { amount: "$120.00", reason: "transfer reference did not match" }, "/profile/billing", between(6, 12), rand() < 0.5);
    const ticket = ticketRows.find((t) => t.authorId === seller.id);
    if (ticket) await bell(seller.id, "TICKET_REPLIED", { title: ticket.title, from: "Sam Patel" }, `/tickets/${ticket.id}`, between(0, 3), false);
    if (ticket) await bell(seller.id, "TICKET_STATUS_CHANGED", { title: ticket.title, status: ticket.status.toLowerCase() }, `/tickets/${ticket.id}`, between(2, 6), true);
    await bell(seller.id, "ORDER_CREATED", { externalId: `${mine[0]?.externalId ?? "DEMO-1000"}-1` }, "/orders", between(8, 20), true);
  }
  for (const staffUser of [admin, sam]) {
    for (const seller of sellers.slice(0, 3)) {
      await bell(staffUser.id, "TRANSACTION_REQUESTED", { from: seller.name ?? "Seller", kind: "top-up", amount: "$400.00" }, "/admin/transactions", between(0, 2), staffUser.id !== admin.id);
    }
    await bell(staffUser.id, "ORDER_ON_HOLD", { externalId: `${PREFIX}1103-1`, reason: HOLD_REASONS[0] }, "/orders", 1, false);
    await bell(staffUser.id, "INVITE_ACCEPTED", { email: `maya${DEMO_DOMAIN}` }, "/admin/users", between(10, 30), true);
  }
  // Warehouse-category bells. The admin is a member of BOTH sites in this
  // seed, so they get the floor's events too — an admin whose customer tab
  // is empty reads as broken, and it is the tab a demo audience clicks first.
  for (const staffUser of [admin, dana, rosa, tom]) {
    await bell(staffUser.id, "WORK_ASSIGNED", { count: String(between(3, 9)), customer: staffUser.id === tom.id ? "LAX1" : "NYC1" }, "/fulfillment", between(0, 2), false);
    await bell(staffUser.id, "FULFILLMENT_BLOCKED", { customer: "NYC1", reason: "No available basket" }, "/fulfillment", between(1, 4), rand() < 0.5);
  }
  for (const staffUser of [admin, dana]) {
    await bell(staffUser.id, "WORK_ASSIGNED", { count: String(between(2, 6)), customer: "LAX1" }, "/fulfillment", between(1, 3), rand() < 0.5);
    await bell(staffUser.id, "LABEL_PURCHASE_FAILED", { count: "2", reason: "missing parcel dimensions on Linen Journal A5" }, "/orders", between(0, 2), false);
  }
  console.log(`→ ${notifCount} notifications (mixed read/unread)`);

  // ── Vendors, expense categories, expenses ─────────────────────────────────
  const vendorRows = [] as Array<{ id: number; name: string }>;
  for (const v of [
    { code: "DM-FAB", name: "Hudson Fabric Supply", contactName: "P. Alvarez", email: "sales@hudsonfabric.example", address: "12 Textile Row, Newark, NJ" },
    { code: "DM-PKG", name: "BoxCraft Packaging", contactName: "M. Chen", email: "orders@boxcraft.example", address: "88 Carton Ave, Brooklyn, NY" },
    { code: "DM-BLK", name: "Apex Blanks Co", contactName: "R. Osei", email: "hello@apexblanks.example", address: "301 Mill St, Charlotte, NC" },
    { code: "DM-INK", name: "PrintChem Inks", contactName: "S. Weber", email: "supply@printchem.example", address: "7 Industrial Way, Trenton, NJ" },
  ]) {
    const column = await prisma.vendor.upsert({ where: { code: v.code }, update: {}, create: { ...v, status: "ACTIVE" } });
    vendorRows.push({ id: column.id, name: column.name });
  }
  const catRows = new Map<string, number>();
  for (const c of [
    ["Materials", "EXPENSE"], ["Rent", "EXPENSE"], ["Salaries", "EXPENSE"],
    ["Shipping Supplies", "EXPENSE"], ["Software", "EXPENSE"], ["Scrap Sales", "INCOME"],
  ] as const) {
    const column = await prisma.expenseCategory.create({ data: { name: c[0], type: c[1], note: NOTE_MARK } });
    catRows.set(c[0], column.id);
  }
  let expenseCount = 0;
  for (let i = 0; i < 36; i++) {
    const income = rand() < 0.12;
    const catName = income ? "Scrap Sales" : pick(["Materials", "Rent", "Salaries", "Shipping Supplies", "Software"]);
    await prisma.expenseEntry.create({
      data: {
        categoryId: catRows.get(catName)!, type: income ? "INCOME" : "EXPENSE",
        amount: D(catName === "Rent" ? 2400 : catName === "Salaries" ? between(1800, 3200) : between(40, 900)),
        occurredAt: ago(between(0, 85)), paymentMethod: pick(["Bank Transfer", "Credit Card", "Cash"]),
        vendorId: catName === "Materials" || catName === "Shipping Supplies" ? pick(vendorRows).id : null,
        description: `${NOTE_MARK} — ${catName === "Rent" ? "Monthly customer rent" : catName === "Scrap Sales" ? "Offcut leather sold" : `${catName} purchase`}`,
        createdById: admin.id,
      },
    });
    expenseCount++;
  }
  console.log(`→ 4 vendors, 6 categories, ${expenseCount} expense entries`);

  // ── Materials, stock with an EXACTLY-summing ledger, receipts, BOMs ───────
  const MATERIALS: Array<[string, string, string, string, number]> = [
    // sku-suffix, name, type, uom, NYC1 target on-hand
    ["MUGBLANK", "Ceramic Mug Blank 11oz", "SEMI_FINISHED", "pcs", 340],
    ["TEEBLANK", "Cotton Tee Blank", "SEMI_FINISHED", "pcs", 280],
    ["CAPBLANK", "Dad Cap Blank", "SEMI_FINISHED", "pcs", 190],
    ["TOTEBLANK", "Canvas Tote Blank", "SEMI_FINISHED", "pcs", 220],
    ["HOODBLANK", "Hoodie Blank", "SEMI_FINISHED", "pcs", 140],
    ["CASEBLANK", "Phone Case Blank", "SEMI_FINISHED", "pcs", 400],
    ["LEATHER", "Veg-Tan Leather Hide", "RAW_MATERIAL", "sqft", 85],
    ["LINEN", "Linen Book Cloth", "RAW_MATERIAL", "m", 120],
    ["BOX-S", "Mailer Box Small", "PACKAGING", "pcs", 500],
    ["BOX-M", "Mailer Box Medium", "PACKAGING", "pcs", 12],   // near-empty → shortage story
    ["POLY", "Poly Mailer Bag", "PACKAGING", "pcs", 900],
    ["CARD", "Thank-You Card", "PACKAGING", "pcs", 0],        // trackInventory false
  ];
  const materialRows = new Map<string, { id: number; name: string; uom: string }>();
  for (const [suffix, name, type, uom] of MATERIALS) {
    const column = await prisma.material.create({
      data: { sku: `${MAT_PREFIX}${suffix}`, name, type: type as never, uom,
        status: "ACTIVE", trackInventory: suffix !== "CARD" },
    });
    materialRows.set(suffix, { id: column.id, name, uom });
  }

  /** Stock + a movement trail that sums EXACTLY to the counters — the ledger
   * is what the movements tab shows, and a ledger that disagrees with the
   * stock page would demo the one bug the whole design exists to prevent.
   *
   * Every column gets a RICH trail so the Movements tab's type filter has all
   * nine types to show: the onHand-affecting set (RECEIPT + MANUAL_IMPORT +
   * MANUAL_ADJUSTMENT + RETURN + CONSUME) is solved so it sums to the target,
   * and the bookkeeping set (RESERVE / RESERVE_RELEASE / NEEDED /
   * NEEDED_RESOLVED) tells a story without touching onHand. */
  let movementCount = 0;
  let stockRowCount = 0;
  const trail = async (
    itemType: "MATERIAL" | "PRODUCT", itemId: number, warehouseId: number, refSlug: string,
    onHand: number, reservedQ: number, needed: number, story: { recovered?: boolean } = {},
  ) => {
    const mv = (type: string, quantity: number, daysAgo: number, refType: string, by = dana.id) =>
      prisma.inventoryMovement.create({
        data: { itemType, materialId: itemType === "MATERIAL" ? itemId : null,
          productVariantId: itemType === "PRODUCT" ? itemId : null, warehouseId,
          type: type as never, quantity, note: NOTE_MARK,
          referenceType: refType, referenceId: `demo-${refSlug}`,
          createdById: by, createdAt: ago(daysAgo, between(0, 20)) },
      }).then(() => { movementCount++; });

    // onHand = receipt + import + adjustment + returned − consumed
    const consumed = between(10, 60);
    const imported = between(5, 30);
    const adjustment = pick([-4, -2, 3, 5]);
    const returned = rand() < 0.4 ? between(1, 4) : 0;
    const receiptQty = onHand + consumed - imported - adjustment - returned;
    await mv("RECEIPT", receiptQty, between(25, 45), "stock_receipt_shipment");
    await mv("MANUAL_IMPORT", imported, between(15, 24), "manual_import", rosa.id);
    await mv("MANUAL_ADJUSTMENT", adjustment, between(8, 14), "manual_adjustment");
    if (returned > 0) await mv("RETURN", returned, between(4, 7), "order");
    await mv("CONSUME", -consumed, between(2, 12), "order", rosa.id);
    if (reservedQ > 0) {
      // One reserve was later released (order cancelled), the rest still hold.
      await mv("RESERVE", reservedQ + 2, between(1, 5), "order", rosa.id);
      await mv("RESERVE_RELEASE", 2, between(0, 1), "order", rosa.id);
    }
    if (needed > 0) await mv("NEEDED", needed, between(0, 3), "order");
    if (story.recovered) {
      // Shortage that has since been restocked: the pair nets to zero and the
      // NEEDED_RESOLVED badge shows up in the filter.
      await mv("NEEDED", 25, between(10, 14), "order");
      await mv("NEEDED_RESOLVED", -25, between(5, 8), "stock_receipt_shipment");
    }
  };
  const stockRow = async (warehouseId: number, suffix: string, onHand: number, reservedQ: number, needed: number, bad = 0, story: { recovered?: boolean } = {}) => {
    const mat = materialRows.get(suffix)!;
    await prisma.materialStock.create({
      data: { warehouseId, materialId: mat.id, quantity: onHand, reserved: reservedQ, needed, badQuantity: bad },
    });
    stockRowCount++;
    await trail("MATERIAL", mat.id, warehouseId, suffix, onHand, reservedQ, needed, story);
  };
  // NYC1 carries every tracked material; BOX-S tells the recovered-shortage
  // story, BOX-M the live-shortage one, LEATHER has damaged units.
  for (const [suffix, , , , target] of MATERIALS) {
    if (suffix === "CARD") continue;
    await stockRow(nyc.id, suffix, target, suffix === "TEEBLANK" ? 24 : suffix === "MUGBLANK" ? 18 : 0,
      suffix === "BOX-M" ? 40 : 0, suffix === "LEATHER" ? 3 : 0,
      { recovered: suffix === "BOX-S" });
  }
  // LAX1 carries most of them too, so the customer filter changes the page.
  for (const [suffix] of MATERIALS) {
    if (suffix === "CARD" || suffix === "LINEN" || suffix === "LEATHER") continue;
    await stockRow(lax.id, suffix, between(40, 220), suffix === "HOODBLANK" ? 8 : 0,
      suffix === "POLY" ? 150 : 0);
  }
  // Finished-goods stock: half the SKUs at NYC1, a quarter at LAX1 — same
  // exact-ledger rule through the same trail builder.
  const productStock = async (warehouseId: number, sku: Sku, onHand: number, reservedQ: number) => {
    await prisma.warehouseInventory.upsert({
      where: { warehouseId_productVariantId: { warehouseId, productVariantId: sku.id } },
      update: { quantity: onHand, reserved: reservedQ, needed: 0, badQuantity: 0 },
      create: { warehouseId, productVariantId: sku.id, quantity: onHand, reserved: reservedQ },
    });
    stockRowCount++;
    await trail("PRODUCT", sku.id, warehouseId, sku.key, onHand, reservedQ, 0);
  };
  for (const sku of skus.filter((_, i) => i % 2 === 0)) await productStock(nyc.id, sku, between(15, 80), between(0, 6));
  for (const sku of skus.filter((_, i) => i % 4 === 1)) await productStock(lax.id, sku, between(10, 50), 0);
  console.log(`→ 12 suppliers, ${stockRowCount} stock rows (suppliers + finished goods, both sites), ${movementCount} ledger movements (sums match counters, all 9 types present)`);

  // Reservations for a handful of in-flight parcels.
  let reservationCount = 0;
  for (const p of seededParcels.filter((x) => ["ASSIGNED", "IN_PRODUCTION"].includes(x.status)).slice(0, 10)) {
    const orderId = p.orderIds[0];
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { productVariantId: true, quantity: true } });
    if (!order?.productVariantId || !p.warehouseId) continue;
    await prisma.inventoryReservation.create({
      data: { itemType: "PRODUCT", productVariantId: order.productVariantId, warehouseId: p.warehouseId,
        orderId, quantity: order.quantity,
        consumedQuantity: p.status === "IN_PRODUCTION" ? order.quantity : 0,
        status: p.status === "IN_PRODUCTION" ? "CONSUMED" : "RESERVED", createdById: dana.id },
    });
    reservationCount++;
  }
  console.log(`→ ${reservationCount} reservations`);

  // ── Receipts: complete / partial / pending / overdue / finished-goods ─────
  const srCode = (d: Date, n: number) =>
    `SR-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${String(10000 + n)}`;
  const mkReceipt = async (opts: {
    n: number; itemType: "MATERIAL" | "PRODUCT"; warehouseId: number; vendorIdx: number; daysAgo: number;
    status: "PENDING" | "PARTIAL" | "COMPLETE" | "REJECTED"; rejectReason?: string;
    shipments: Array<{ eta: number; status: "PENDING" | "PARTIAL_RECEIVED" | "RECEIVED" | "REJECTED";
      lines: Array<{ suffix?: string; skuIdx?: number; req: number; recv?: number; rej?: number; price?: number }> }>;
  }) => {
    const createdAt = ago(opts.daysAgo);
    const settled = opts.status === "COMPLETE" || opts.status === "REJECTED";
    const receipt = await prisma.stockReceipt.create({
      data: { code: srCode(createdAt, opts.n), itemType: opts.itemType, warehouseId: opts.warehouseId,
        status: opts.status, provider: vendorRows[opts.vendorIdx].name, note: NOTE_MARK,
        rejectReason: opts.rejectReason ?? null,
        createdById: admin.id, approvedById: settled ? dana.id : null,
        approvedAt: settled ? ago(Math.max(0, opts.daysAgo - 2)) : null, createdAt },
      select: { id: true },
    });
    for (const [si, s] of opts.shipments.entries()) {
      const shipment = await prisma.stockReceiptShipment.create({
        data: { receiptId: receipt.id, vendorId: vendorRows[opts.vendorIdx].id, shipmentCode: `S${si + 1}`,
          trackingNumber: `1Z${between(100000, 999999)}DEMO${si}`, carrier: pick(["UPS", "FedEx", "USPS"]),
          expectedArrivalAt: ago(-s.eta), status: s.status,
          receivedAt: s.status !== "PENDING" ? ago(Math.max(0, opts.daysAgo - 3)) : null,
          evidence: s.status !== "PENDING" ? evidence(DOCK_PHOTOS[si % DOCK_PHOTOS.length], "dock-photo.jpg", dana.id) : undefined,
          createdAt },
        select: { id: true },
      });
      for (const line of s.lines) {
        await prisma.stockReceiptLine.create({
          data: { receiptId: receipt.id, shipmentId: shipment.id,
            materialId: line.suffix ? materialRows.get(line.suffix)!.id : null,
            productVariantId: line.skuIdx !== undefined ? skus[line.skuIdx].id : null,
            requestedQuantity: line.req, receivedQuantity: line.recv ?? null,
            rejectedQuantity: line.rej ?? 0, unitPrice: line.price !== undefined ? D(line.price) : null,
            createdAt },
        });
      }
    }
  };
  await mkReceipt({ n: 1, itemType: "MATERIAL", warehouseId: nyc.id, vendorIdx: 2, daysAgo: 28, status: "COMPLETE",
    shipments: [{ eta: -25, status: "RECEIVED", lines: [
      { suffix: "MUGBLANK", req: 200, recv: 200, price: 2.4 }, { suffix: "TEEBLANK", req: 150, recv: 148, rej: 2, price: 3.1 }] }] });
  await mkReceipt({ n: 2, itemType: "MATERIAL", warehouseId: nyc.id, vendorIdx: 1, daysAgo: 21, status: "COMPLETE",
    shipments: [{ eta: -18, status: "RECEIVED", lines: [
      { suffix: "BOX-S", req: 500, recv: 500, price: 0.55 }, { suffix: "POLY", req: 1000, recv: 1000, price: 0.12 }] }] });
  await mkReceipt({ n: 3, itemType: "MATERIAL", warehouseId: nyc.id, vendorIdx: 0, daysAgo: 9, status: "PARTIAL",
    shipments: [
      { eta: -6, status: "PARTIAL_RECEIVED", lines: [{ suffix: "LEATHER", req: 60, recv: 35, price: 8.5 }] },
      { eta: 4, status: "PENDING", lines: [{ suffix: "LINEN", req: 80, price: 4.2 }] },
    ] });
  await mkReceipt({ n: 4, itemType: "MATERIAL", warehouseId: nyc.id, vendorIdx: 1, daysAgo: 6, status: "PENDING",
    shipments: [
      { eta: 5, status: "PENDING", lines: [{ suffix: "BOX-M", req: 400, price: 0.72 }] },
      { eta: -3, status: "PENDING", lines: [{ suffix: "CARD", req: 1000, price: 0.05 }] }, // overdue ETA → red tile
    ] });
  await mkReceipt({ n: 5, itemType: "PRODUCT", warehouseId: lax.id, vendorIdx: 2, daysAgo: 3, status: "PENDING",
    shipments: [{ eta: 6, status: "PENDING", lines: [{ skuIdx: 0, req: 60, price: 6.0 }, { skuIdx: 3, req: 40, price: 7.5 }] }] });
  // The rest of the spread: a rejected one (with its reason banner), LAX
  // receipts so the customer filter matters, a finished-goods COMPLETE, a
  // three-shipment staggered delivery, and a PRODUCT partial.
  await mkReceipt({ n: 6, itemType: "MATERIAL", warehouseId: nyc.id, vendorIdx: 3, daysAgo: 14, status: "REJECTED",
    rejectReason: "Wrong ink grade delivered — returned to vendor",
    shipments: [{ eta: -12, status: "REJECTED", lines: [{ suffix: "LEATHER", req: 30, rej: 30, price: 8.9 }] }] });
  await mkReceipt({ n: 7, itemType: "MATERIAL", warehouseId: lax.id, vendorIdx: 2, daysAgo: 17, status: "COMPLETE",
    shipments: [{ eta: -15, status: "RECEIVED", lines: [
      { suffix: "CASEBLANK", req: 250, recv: 250, price: 1.8 }, { suffix: "HOODBLANK", req: 80, recv: 80, price: 9.2 }] }] });
  await mkReceipt({ n: 8, itemType: "PRODUCT", warehouseId: nyc.id, vendorIdx: 2, daysAgo: 12, status: "COMPLETE",
    shipments: [{ eta: -10, status: "RECEIVED", lines: [
      { skuIdx: 6, req: 45, recv: 45, price: 5.4 }, { skuIdx: 9, req: 30, recv: 28, rej: 2, price: 6.8 }] }] });
  await mkReceipt({ n: 9, itemType: "MATERIAL", warehouseId: lax.id, vendorIdx: 1, daysAgo: 4, status: "PARTIAL",
    shipments: [
      { eta: -2, status: "RECEIVED", lines: [{ suffix: "POLY", req: 500, recv: 500, price: 0.11 }] },
      { eta: 2, status: "PENDING", lines: [{ suffix: "BOX-S", req: 300, price: 0.58 }] },
      { eta: 9, status: "PENDING", lines: [{ suffix: "BOX-M", req: 200, price: 0.74 }] },
    ] });
  await mkReceipt({ n: 10, itemType: "PRODUCT", warehouseId: lax.id, vendorIdx: 0, daysAgo: 7, status: "PARTIAL",
    shipments: [
      { eta: -4, status: "PARTIAL_RECEIVED", lines: [{ skuIdx: 12, req: 50, recv: 20, price: 4.1 }] },
      { eta: 3, status: "PENDING", lines: [{ skuIdx: 15, req: 35, price: 5.2 }] },
    ] });
  console.log("→ 10 receipts (complete / partial / pending / overdue-ETA / rejected, both item types, both sites)");

  // ── BOMs: 4 active + 1 draft with an unmapped line ────────────────────────
  const mkBom = async (skuKey: string, lines: Array<[string | null, string, string, number, string, number]>, status: "ACTIVE" | "DRAFT") => {
    const sku = skus.find((s) => s.key === skuKey)!;
    await prisma.bom.create({
      data: {
        productVariantId: sku.id, name: `${BOM_MARK}${sku.product} BOM`, version: 1, status,
        createdById: admin.id,
        lines: { create: lines.map(([suffix, compSku, compName, qty, uom, wastage], i) => ({
          materialId: suffix ? materialRows.get(suffix)!.id : null,
          componentSku: suffix ? `${MAT_PREFIX}${suffix}` : compSku,
          componentName: compName, quantityPerUnit: new Prisma.Decimal(qty.toFixed(4)),
          unit: uom, wastageRate: new Prisma.Decimal(wastage.toFixed(4)),
          stage: i === lines.length - 1 ? "PACKING" : "PRODUCTION", required: true, sortOrder: i,
        })) },
      },
    });
  };
  await mkBom("ceramic-mug", [["MUGBLANK", "", "Ceramic Mug Blank 11oz", 1, "pcs", 0.02], ["BOX-S", "", "Mailer Box Small", 1, "pcs", 0], ["CARD", "", "Thank-You Card", 1, "pcs", 0]], "ACTIVE");
  await mkBom("classic-tee", [["TEEBLANK", "", "Cotton Tee Blank", 1, "pcs", 0.03], ["POLY", "", "Poly Mailer Bag", 1, "pcs", 0]], "ACTIVE");
  await mkBom("tote-bag", [["TOTEBLANK", "", "Canvas Tote Blank", 1, "pcs", 0.02], ["POLY", "", "Poly Mailer Bag", 1, "pcs", 0]], "ACTIVE");
  await mkBom("leather-wallet", [["LEATHER", "", "Veg-Tan Leather Hide", 0.45, "sqft", 0.08], ["BOX-S", "", "Mailer Box Small", 1, "pcs", 0]], "ACTIVE");
  // The DRAFT with an UNMAPPED line — the "incomplete" state the Configs page counts.
  await mkBom("phone-case", [[null, "DM-UNKNOWN-FOAM", "Foam Insert (unmapped)", 1, "pcs", 0], ["BOX-S", "", "Mailer Box Small", 1, "pcs", 0]], "DRAFT");
  console.log("→ 5 BOMs (4 active, 1 draft with an unmapped line)");

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`
════════════════════════════════════════════════════════════════════
Demo world seeded. Sign-ins:
  ADMIN      ${ADMIN_EMAIL}  (your real account — Google; ADMIN role ensured)
  SELLERS    maya / leo / sofia / kenji ${DEMO_DOMAIN}   password: demo1234
  WAREHOUSE  rosa (NYC1) · tom (LAX1) · dana (both, admin)${DEMO_DOMAIN}
  SUPPORT    sam${DEMO_DOMAIN}
  API KEY    ${DEMO_API_KEY}   (maya's — try GET /api/v1/orders)

Things to show:
  /orders          ~${orderCount} orders, all 8 statuses, 60 days of history
  /fulfillment     scan ${tracking(30)} or ${tracking(50)} (IN_PRODUCTION parcels)
  /inventory       shortage on Mailer Box Medium; ledger sums match counters
  /inventory/receipts  one PARTIAL, one overdue-ETA (red tiles live)
  /admin/boms      4 active + 1 draft with an incomplete line
  /admin/transactions  pending top-ups with bank-slip evidence to approve
  /tickets         ${TICKET_SEEDS.length} threads, unread bells on the sellers
  Dashboard        real numbers for admin, every seller, and the customer

Remove ALL of it later:   npm run db:seed:demo -- --wipe
Prod (deliberate, two envs):
  ENV_FILE=.env.prod SEED_ALLOW_REMOTE=1 npm run db:seed:demo
════════════════════════════════════════════════════════════════════`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
