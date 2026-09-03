"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import * as mockups from "./service.ts";

export async function createMockupAction(input: unknown) {
  const actor = await requirePermission("mockups.manage");
  return withValidation(async () => {
    const result = await mockups.createMockup(actor, input, await auditContext(actor));
    revalidatePath("/admin/mockups");
    return result;
  });
}

export async function updateMockupAction(id: number, input: unknown) {
  const actor = await requirePermission("mockups.manage");
  return withValidation(async () => {
    const result = await mockups.updateMockup(actor, id, input, await auditContext(actor));
    revalidatePath("/admin/mockups");
    return result;
  });
}

export async function getMockupUsageAction(id: number) {
  const actor = await requirePermission("mockups.manage");
  return mockups.getMockupUsage(actor, id);
}

export async function deleteMockupAction(id: number) {
  const actor = await requirePermission("mockups.manage");
  const result = await mockups.deleteMockup(actor, id, await auditContext(actor));
  revalidatePath("/admin/mockups");
  return result;
}

/** Active mockups for the order form. */
export async function listMockupOptionsAction() {
  const actor = await requirePermission("mockups.manage");
  const { rows } = await mockups.listMockups(actor, { status: "active", pageSize: 100 });
  return rows.map((m) => ({ id: m.id, name: m.name }));
}
