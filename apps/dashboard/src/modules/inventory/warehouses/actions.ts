"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import * as warehouses from "./service.ts";

export async function createWarehouseAction(input: unknown) {
  const actor = await requirePermission("warehouses.manage");
  const result = await warehouses.createWarehouse(actor, input, await auditContext(actor));
  revalidatePath("/admin/warehouses");
  return result;
}

export async function updateWarehouseAction(id: number, input: unknown) {
  const actor = await requirePermission("warehouses.manage");
  const result = await warehouses.updateWarehouse(actor, id, input, await auditContext(actor));
  revalidatePath("/admin/warehouses");
  return result;
}

export async function setWarehouseStatusAction(id: number, status: "ACTIVE" | "INACTIVE") {
  const actor = await requirePermission("warehouses.manage");
  const result = await warehouses.setWarehouseStatus(actor, id, status, await auditContext(actor));
  revalidatePath("/admin/warehouses");
  return result;
}

/** Read-only, but exposed as an action because the delete dialog needs it from
 * the client before deciding whether to offer delete or deactivate. */
export async function getWarehouseUsageAction(id: number) {
  const actor = await requirePermission("warehouses.manage");
  return warehouses.getWarehouseUsage(actor, id);
}

/**
 * Current staff plus who could be added. Both come from one call so the dialog
 * can't show a stale "add" list after a change.
 *
 * Candidates are limited to customer-shaped roles — offering to assign a
 * seller to a customer would be a mistake the UI shouldn't invite.
 */
export async function listWarehouseStaffAction(warehouseId: number) {
  const actor = await requirePermission("warehouses.members.manage");
  const wh = await warehouses.getWarehouse(actor, warehouseId);
  const staff = await warehouses.listAssignableStaff(actor);
  return {
    members: wh.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name ?? "",
      email: m.user.email,
      isPrimary: m.isPrimary,
    })),
    candidates: staff,
  };
}

export async function deleteWarehouseAction(id: number) {
  const actor = await requirePermission("warehouses.manage");
  const result = await warehouses.deleteWarehouse(actor, id, await auditContext(actor));
  revalidatePath("/admin/warehouses");
  return result;
}

export async function addWarehouseMemberAction(warehouseId: number, userId: string, isPrimary: boolean) {
  const actor = await requirePermission("warehouses.members.manage");
  const result = await warehouses.addWarehouseMember(actor, warehouseId, userId, isPrimary, await auditContext(actor));
  revalidatePath(`/admin/warehouses/${warehouseId}`);
  return result;
}

export async function removeWarehouseMemberAction(warehouseId: number, userId: string) {
  const actor = await requirePermission("warehouses.members.manage");
  const result = await warehouses.removeWarehouseMember(actor, warehouseId, userId, await auditContext(actor));
  revalidatePath(`/admin/warehouses/${warehouseId}`);
  return result;
}
