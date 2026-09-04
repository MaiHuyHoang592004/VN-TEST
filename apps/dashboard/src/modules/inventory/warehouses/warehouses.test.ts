/**
 * Warehouse master-data scoping.
 *
 * WAREHOUSE/WAREHOUSE_ADMIN are site-bound everywhere else in inventory
 * (stock, movements, receipts) but listWarehouses/getWarehouse had no scope
 * filter at all, so a WAREHOUSE_ADMIN for one site saw and could staff every
 * site in the company through this screen.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";
import { listWarehouses, getWarehouse, addWarehouseMember, removeWarehouseMember } from "./service.ts";

let adminAdminId: string;
let siteAdminId: string;
let siteA: number;
let siteB: number;

const admin = () => ({ id: adminAdminId, roles: ["ADMIN"] as UserRole[] });
const siteAdmin = () => ({ id: siteAdminId, roles: ["WAREHOUSE_ADMIN"] as UserRole[] });
const ctx = (actor: { id: string; roles: UserRole[] }) => ({ actor, ip: null, userAgent: null });

before(async () => {
  const [a, s] = await Promise.all([
    prisma.user.create({ data: { email: "wht-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "wht-siteadmin@test.local", roles: ["WAREHOUSE_ADMIN"] } }),
  ]);
  adminAdminId = a.id;
  siteAdminId = s.id;
  const [wa, wb] = await Promise.all([
    prisma.warehouse.create({ data: { code: "WHT-A", name: "Site A", timezone: "UTC", status: "ACTIVE" } }),
    prisma.warehouse.create({ data: { code: "WHT-B", name: "Site B", timezone: "UTC", status: "ACTIVE" } }),
  ]);
  siteA = wa.id;
  siteB = wb.id;
  await prisma.warehouseMember.create({ data: { userId: siteAdminId, warehouseId: siteA, isPrimary: true } });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [adminAdminId, siteAdminId] } } });
  await prisma.warehouseMember.deleteMany({ where: { userId: siteAdminId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminAdminId, siteAdminId] } } });
  await prisma.warehouse.deleteMany({ where: { id: { in: [siteA, siteB] } } });
});

test("a site-scoped WAREHOUSE_ADMIN lists only their own site", async () => {
  const rows = await listWarehouses(siteAdmin());
  assert.deepEqual(rows.map((r) => r.id).sort(), [siteA]);

  const all = await listWarehouses(admin());
  assert.ok(all.map((r) => r.id).includes(siteB), "an unscoped ADMIN still sees every site");
});

test("getWarehouse on another site is a 404-shaped miss, not a column", async () => {
  await assert.rejects(() => getWarehouse(siteAdmin(), siteB));
  const own = await getWarehouse(siteAdmin(), siteA);
  assert.equal(own.id, siteA);
});

test("staffing another site is refused", async () => {
  const someoneElse = await prisma.user.create({
    data: { email: "wht-candidate@test.local", roles: ["WAREHOUSE"] },
  });
  const result = await addWarehouseMember(siteAdmin(), siteB, someoneElse.id, false, ctx(siteAdmin()));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error, "not-your-site");
  const member = await prisma.warehouseMember.findUnique({
    where: { userId_warehouseId: { userId: someoneElse.id, warehouseId: siteB } },
  });
  assert.equal(member, null, "nothing was written");

  // Their own site still works.
  const ok = await addWarehouseMember(siteAdmin(), siteA, someoneElse.id, false, ctx(siteAdmin()));
  assert.equal(ok.ok, true);

  const removed = await removeWarehouseMember(siteAdmin(), siteB, someoneElse.id, ctx(siteAdmin()));
  assert.equal(removed.ok, false);
  assert.equal(removed.ok === false && removed.error, "not-your-site");

  await prisma.warehouseMember.deleteMany({ where: { userId: someoneElse.id } });
  await prisma.user.deleteMany({ where: { id: someoneElse.id } });
});
