"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { withValidation } from "../../core/action-result.ts";
import { InventoryError } from "../stock/service.ts";
import * as boms from "./service.ts";

async function guarded<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InventoryError) return { ok: false as const, error: e.code };
    throw e;
  }
}

const refresh = () => revalidatePath("/admin/boms");

export async function createBomAction(productVariantId: number, input: unknown) {
  const actor = await requirePermission("boms.manage");
  const ctx = await auditContext(actor);
  const result = await withValidation(() =>
    guarded(() => boms.createBom(actor, productVariantId, input, ctx)),
  );
  refresh();
  return result;
}

export async function updateBomAction(id: number, input: unknown) {
  const actor = await requirePermission("boms.manage");
  const ctx = await auditContext(actor);
  const result = await withValidation(() => guarded(() => boms.updateBom(actor, id, input, ctx)));
  refresh();
  return result;
}

export async function activateBomAction(id: number) {
  const actor = await requirePermission("boms.manage");
  const ctx = await auditContext(actor);
  const result = await guarded(() => boms.activateBom(actor, id, ctx));
  refresh();
  return result;
}

export async function duplicateBomAction(id: number) {
  const actor = await requirePermission("boms.manage");
  const ctx = await auditContext(actor);
  const result = await guarded(() => boms.duplicateBom(actor, id, ctx));
  refresh();
  return result;
}

export async function deleteBomAction(id: number) {
  const actor = await requirePermission("boms.manage");
  const ctx = await auditContext(actor);
  const result = await guarded(() => boms.deleteBom(actor, id, ctx));
  refresh();
  return result;
}

/** Read-only, but actions because the BOM dialog loads them without navigating. */
export async function getBomAction(id: number) {
  const actor = await requirePermission("inventory.read");
  return boms.getBom(actor, id);
}

export async function listVersionsAction(productVariantId: number) {
  const actor = await requirePermission("inventory.read");
  return boms.listVersions(actor, productVariantId);
}

/** The preview panel. Exploded through the SAME function reservation uses, so
 * what the panel promises and what assignment does cannot disagree. */
export async function previewConsumptionAction(input: unknown) {
  const actor = await requirePermission("inventory.read");
  return guarded(() => boms.previewConsumption(actor, input));
}
