import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client.ts";
import { seedV2 } from "../prisma/scripts/seed-v2.ts";

test("seedV2 is idempotent and creates the demo tenant", async () => {
  const first = await seedV2(prisma);
  const second = await seedV2(prisma);
  assert.equal(first.organizationId, second.organizationId);
  assert.equal(await prisma.organization.count({ where: { slug: "demo-seller" } }), 1);
  assert.equal(await prisma.store.count({ where: { organizationId: first.organizationId } }), 1);
  assert.equal(await prisma.sku.count(), 6);
  assert.equal(await prisma.bomRevision.count({ where: { status: "ACTIVE" } }), 3);
  const balances = await prisma.inventoryBalance.findMany({ where: { facilityId: first.facilityId } });
  assert.ok(balances.length >= 3);
  for (const b of balances) assert.ok(Number(b.onHand) >= Number(b.reserved));
  await prisma.$disconnect();
});
