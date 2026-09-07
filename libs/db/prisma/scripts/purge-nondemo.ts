/**
 * Removes the rows the demo wipe deliberately does NOT touch, so that
 * `seed-demo.ts --wipe` can then finish the job.
 *
 * Two groups:
 *   · the E2E-* orders and the "E2E Test Mug" product created while walking the
 *     order flow by hand;
 *   · ETSY-9001 and "Áo Thun Cotton", the legacy row that predates the demo
 *     seed and carries no demo marker.
 *
 * Both matter for ordering: `--wipe` KEEPS a demo product when a NON-demo order
 * references it, and E2E-BULK-002 points at ceramic-mug. Clear these first or
 * the wipe leaves that product behind.
 *
 * LOCAL ONLY, on purpose — the same guard the seed script uses.
 */
import { prisma } from "../../src/client.ts";

const url = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const host = url.replace(/:[^:@/]+@/, ":***@").replace(/\?.*/, "");

// Same opt-in seed-demo.ts uses: local by default, and a remote target needs
// an environment variable you cannot arrive at by pressing up-arrow in a shell.
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to purge: ${host} is not a local database.`);
  console.error("Set SEED_ALLOW_REMOTE=1 if that is genuinely what you want.");
  process.exit(1);
}
if (!isLocal) {
  console.warn(`\n⚠  REMOTE DATABASE: ${host}`);
  console.warn(`⚠  This changes data that real signed-in users will see.\n`);
}

const ORDER_PREFIXES = ["E2E-", "ETSY-"];
const PRODUCT_KEYS = ["e2e-test-mug", "ao-thun-cotton"];

async function main() {
  const orders = await prisma.order.findMany({
    where: { OR: ORDER_PREFIXES.map((p) => ({ externalId: { startsWith: p } })) },
    select: { id: true, externalId: true, shippingAddressId: true },
  });
  const orderIds = orders.map((o) => o.id);
  console.log(`orders to remove: ${orders.map((o) => o.externalId).join(", ") || "(none)"}`);

  if (orderIds.length) {
    // The paper trail points AT the order, so it goes first.
    await prisma.inventoryReservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.notification.deleteMany({
      where: { data: { path: ["externalId"], string_starts_with: "E2E-" } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    const addressIds = orders
      .map((o) => o.shippingAddressId)
      .filter((x): x is number => x !== null);
    if (addressIds.length) {
      await prisma.address.deleteMany({ where: { id: { in: addressIds } } });
    }
    console.log(`→ removed ${orderIds.length} orders and ${addressIds.length} addresses`);
  }

  for (const key of PRODUCT_KEYS) {
    const product = await prisma.product.findUnique({
      where: { key },
      select: { id: true, name: true, variants: { select: { id: true, variantId: true } } },
    });
    if (!product) {
      console.log(`→ product ${key}: not present`);
      continue;
    }
    const skuIds = product.variants.map((v) => v.id);
    await prisma.inventoryMovement.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.inventoryReservation.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.warehouseInventory.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.stockReceiptLine.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.bom.deleteMany({ where: { productVariantId: { in: skuIds } } });
    await prisma.userAllowedProduct.deleteMany({ where: { productId: product.id } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } }); // prices cascade
    await prisma.product.delete({ where: { id: product.id } });
    console.log(`→ removed product ${key} ("${product.name}") and ${skuIds.length} SKUs`);
  }

  const left = await prisma.order.count();
  console.log(`orders remaining in the database: ${left}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
