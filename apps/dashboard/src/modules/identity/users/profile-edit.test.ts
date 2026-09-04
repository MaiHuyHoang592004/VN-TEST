/**
 * updateUser() — the admin edit-profile path.
 *
 * The bug this guards: EditUserDialog never sends `warehouseId` at all
 * (it has no field for it), so `input.warehouseId` parses to `undefined`.
 * The write used to treat that identically to an explicit `null` and
 * disconnect the warehouse on every save, regardless of what was actually
 * being changed.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";
import { updateUser } from "./service.ts";

let adminId: string;
let sellerId: string;
let warehouseId: number;

const actor = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const ctx = () => ({ actor: actor(), ip: null, userAgent: null });

before(async () => {
  const [a, s] = await Promise.all([
    prisma.user.create({ data: { email: "pe-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "pe-seller@test.local", roles: ["WAREHOUSE"] } }),
  ]);
  adminId = a.id;
  sellerId = s.id;
  const wh = await prisma.warehouse.create({
    data: { code: "PETEST", name: "Profile Edit Test Site", timezone: "UTC", status: "ACTIVE" },
  });
  warehouseId = wh.id;
  await prisma.user.update({ where: { id: sellerId }, data: { warehouseId } });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [adminId, sellerId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, sellerId] } } });
  await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
});

test("EditUserDialog's payload shape (no warehouseId key at all) leaves the warehouse alone", async () => {
  // Exactly what apps/dashboard/src/components/pages/admin/users/edit-user-dialog.tsx
  // submits — warehouseId is never a key in this object.
  const result = await updateUser(
    actor(),
    sellerId,
    { name: "Renamed", phone: "", roles: ["WAREHOUSE"], status: "ACTIVE", tier: null, adminNote: "" },
    ctx(),
  );
  assert.equal(result.ok, true);

  const column = await prisma.user.findUniqueOrThrow({
    where: { id: sellerId },
    select: { name: true, warehouseId: true },
  });
  assert.equal(column.name, "Renamed", "the actual edit still landed");
  assert.equal(column.warehouseId, warehouseId, "the warehouse this save never mentioned is untouched");
});

test("an explicit null warehouseId still disconnects it", async () => {
  const result = await updateUser(
    actor(),
    sellerId,
    { name: "Renamed", phone: "", roles: ["WAREHOUSE"], status: "ACTIVE", tier: null, warehouseId: null, adminNote: "" },
    ctx(),
  );
  assert.equal(result.ok, true);
  const column = await prisma.user.findUniqueOrThrow({ where: { id: sellerId }, select: { warehouseId: true } });
  assert.equal(column.warehouseId, null, "an explicit null still clears it — this is the one real signal to disconnect");
});

test("an explicit warehouseId still connects it", async () => {
  const other = await prisma.warehouse.create({
    data: { code: "PETEST2", name: "Second Site", timezone: "UTC", status: "ACTIVE" },
  });
  const result = await updateUser(
    actor(),
    sellerId,
    { name: "Renamed", phone: "", roles: ["WAREHOUSE"], status: "ACTIVE", tier: null, warehouseId: other.id, adminNote: "" },
    ctx(),
  );
  assert.equal(result.ok, true);
  const column = await prisma.user.findUniqueOrThrow({ where: { id: sellerId }, select: { warehouseId: true } });
  assert.equal(column.warehouseId, other.id);
  await prisma.user.update({ where: { id: sellerId }, data: { warehouseId } });
  await prisma.warehouse.deleteMany({ where: { id: other.id } });
});
