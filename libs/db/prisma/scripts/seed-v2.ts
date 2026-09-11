/**
 * Synthetic demo data. No customer data, no company price lists, no real product names.
 * Idempotent: every write is an upsert on a unique key so re-running is safe.
 * Run: npm run db:seed (from libs/db)   |   import { seedV2 } from tests.
 */
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.ts";

const D = (v: string | number) => new Prisma.Decimal(v);

export async function seedV2(prisma: PrismaClient) {
  const admin = await prisma.user.upsert({
    where: { email: "admin@fulfillflow.local" },
    update: {},
    create: { email: "admin@fulfillflow.local", name: "Platform Admin", platformRole: "ADMIN" },
  });

  const priceList = await prisma.priceList.upsert({
    where: { id: "01900000-0000-7000-8000-000000000001" },
    update: {},
    create: { id: "01900000-0000-7000-8000-000000000001", name: "Standard USD", currency: "USD" },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "demo-seller" },
    update: { priceListId: priceList.id },
    create: { name: "Demo Seller LLC", slug: "demo-seller", priceListId: priceList.id },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo-seller.local" },
    update: {},
    create: { email: "owner@demo-seller.local", name: "Demo Owner" },
  });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
    update: {},
    create: { organizationId: org.id, userId: owner.id, role: "OWNER" },
  });

  const manualStore = await prisma.store.upsert({
    where: { provider_externalStoreId: { provider: "MANUAL", externalStoreId: `manual:${org.slug}` } },
    update: {},
    create: { organizationId: org.id, provider: "MANUAL", externalStoreId: `manual:${org.slug}`, name: "Manual / CSV" },
  });

  // Raw materials
  const materials = [
    { code: "MAT-MUG-BLANK-11", name: "Blank mug 11oz", uom: "pcs" },
    { code: "MAT-SHIRT-BLANK", name: "Blank cotton shirt", uom: "pcs" },
    { code: "MAT-WOOD-SHEET", name: "Birch plywood 3mm", uom: "m2" },
    { code: "MAT-BOX-SMALL", name: "Shipping box S", uom: "pcs" },
  ];
  const mat: Record<string, string> = {};
  for (const m of materials) {
    const item = await prisma.inventoryItem.upsert({
      where: { code: m.code },
      update: { name: m.name, uom: m.uom },
      create: { ...m, kind: m.code.startsWith("MAT-BOX") ? "PACKAGING" : "RAW_MATERIAL" },
    });
    mat[m.code] = item.id;
  }

  // Products + SKUs (Sku.id === InventoryItem.id)
  const catalog = [
    { handle: "classic-mug", name: "Classic Mug", skus: [
      { code: "MUG-11-WHT", attrs: { size: "11oz", color: "white" }, mode: "MADE_TO_ORDER", bom: [["MAT-MUG-BLANK-11", "1"], ["MAT-BOX-SMALL", "1"]] },
      { code: "MUG-11-BLK", attrs: { size: "11oz", color: "black" }, mode: "MADE_TO_ORDER", bom: [["MAT-MUG-BLANK-11", "1"], ["MAT-BOX-SMALL", "1"]] },
    ]},
    { handle: "cotton-tee", name: "Cotton Tee", skus: [
      { code: "TEE-M-BLK", attrs: { size: "M", color: "black" }, mode: "MADE_TO_ORDER", bom: [["MAT-SHIRT-BLANK", "1"]] },
      { code: "TEE-L-BLK", attrs: { size: "L", color: "black" }, mode: "MADE_TO_ORDER", bom: [] },
    ]},
    { handle: "wood-ornament", name: "Wood Ornament", skus: [
      { code: "ORN-WOOD-STD", attrs: { size: "std" }, mode: "MADE_TO_ORDER", bom: [] },
      { code: "ORN-WOOD-BLANK", attrs: { size: "std", finish: "raw" }, mode: "FROM_STOCK", bom: [] },
    ]},
  ] as const;

  const skuIds: Record<string, string> = {};
  for (const p of catalog) {
    const product = await prisma.product.upsert({
      where: { handle: p.handle },
      update: { name: p.name, status: "ACTIVE" },
      create: { handle: p.handle, name: p.name, status: "ACTIVE" },
    });
    for (const s of p.skus) {
      const item = await prisma.inventoryItem.upsert({
        where: { code: s.code },
        update: { name: `${p.name} ${Object.values(s.attrs).join(" ")}` },
        create: { code: s.code, name: `${p.name} ${Object.values(s.attrs).join(" ")}`, kind: "FINISHED_GOOD" },
      });
      const sku = await prisma.sku.upsert({
        where: { id: item.id },
        update: { attributes: s.attrs, supplyMode: s.mode, status: "ACTIVE" },
        create: { id: item.id, productId: product.id, attributes: s.attrs, supplyMode: s.mode, status: "ACTIVE" },
      });
      skuIds[s.code] = sku.id;
      await prisma.priceListItem.upsert({
        where: { priceListId_skuId_minQuantity: { priceListId: priceList.id, skuId: sku.id, minQuantity: 1 } },
        update: {},
        create: { priceListId: priceList.id, skuId: sku.id, minQuantity: 1, unitPrice: D("4.5000") },
      });
      if (s.bom.length > 0) {
        const rev = await prisma.bomRevision.upsert({
          where: { skuId_version: { skuId: sku.id, version: 1 } },
          update: {},
          create: { skuId: sku.id, version: 1, status: "ACTIVE", activatedAt: new Date() },
        });
        for (const [code, qty] of s.bom) {
          await prisma.bomComponent.upsert({
            where: { bomRevisionId_inventoryItemId: { bomRevisionId: rev.id, inventoryItemId: mat[code] } },
            update: { quantityPerUnit: D(qty) },
            create: { bomRevisionId: rev.id, inventoryItemId: mat[code], quantityPerUnit: D(qty) },
          });
        }
      }
    }
  }

  const facility = await prisma.facility.upsert({
    where: { code: "HN-01" },
    update: {},
    create: { code: "HN-01", name: "Hanoi Print Facility", countryCode: "VN", timezone: "Asia/Ho_Chi_Minh" },
  });
  await prisma.facilityMembership.upsert({
    where: { facilityId_userId: { facilityId: facility.id, userId: admin.id } },
    update: {},
    create: { facilityId: facility.id, userId: admin.id, role: "MANAGER" },
  });
  for (const skuId of Object.values(skuIds)) {
    await prisma.facilitySkuCapability.upsert({
      where: { facilityId_skuId: { facilityId: facility.id, skuId } },
      update: {},
      create: { facilityId: facility.id, skuId, dailyCapacity: 200, leadTimeHours: 48 },
    });
  }
  for (const [code, onHand] of [["MAT-MUG-BLANK-11", "500"], ["MAT-SHIRT-BLANK", "300"], ["MAT-BOX-SMALL", "1000"], ["MAT-WOOD-SHEET", "25.5"]] as const) {
    await prisma.inventoryBalance.upsert({
      where: { facilityId_inventoryItemId: { facilityId: facility.id, inventoryItemId: mat[code] } },
      update: {},
      create: { facilityId: facility.id, inventoryItemId: mat[code], onHand: D(onHand) },
    });
  }
  await prisma.inventoryBalance.upsert({
    where: { facilityId_inventoryItemId: { facilityId: facility.id, inventoryItemId: skuIds["ORN-WOOD-BLANK"] } },
    update: {},
    create: { facilityId: facility.id, inventoryItemId: skuIds["ORN-WOOD-BLANK"], onHand: D("40") },
  });

  return { organizationId: org.id, manualStoreId: manualStore.id, facilityId: facility.id, skuIds };
}

if (process.argv[1]?.endsWith("seed-v2.ts")) {
  const { prisma } = await import("../../src/client.ts");
  const r = await seedV2(prisma);
  console.log("seeded", r);
  await prisma.$disconnect();
}
