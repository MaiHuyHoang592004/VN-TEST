"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "../../core/guard.ts";
import { auditContext } from "../../core/context.ts";
import { warehouseScopeIds } from "@gwprint/db";

import { withValidation } from "../../core/action-result.ts";
import { listWarehouses } from "../warehouses/service.ts";
import { InventoryError } from "./service.ts";
import * as stock from "./service.ts";

/** Turn a coded refusal into the {ok:false,error} shape forms already render.
 * Anything else is a real fault and keeps throwing. */
async function guarded<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InventoryError) return { ok: false as const, error: e.code };
    throw e;
  }
}

export async function adjustStockAction(input: unknown) {
  const actor = await requirePermission("inventory.adjust");
  const ctx = await auditContext(actor);
  const result = await withValidation(() => guarded(() => stock.adjustStock(actor, input, ctx)));
  revalidatePath("/inventory");
  return result;
}

export async function quickImportAction(input: unknown) {
  const actor = await requirePermission("inventory.adjust");
  const ctx = await auditContext(actor);
  const result = await withValidation(() => guarded(() => stock.quickImport(actor, input, ctx)));
  revalidatePath("/inventory");
  return result;
}

/** Sites the actor may pick in the adjust and import dialogs. Scoped, so the
 * select cannot offer a customer the action would then refuse. */
export async function listMySitesAction() {
  const actor = await requirePermission("inventory.read");
  const ids = await warehouseScopeIds(actor);
  const all = await listWarehouses(actor);
  return all
    .filter((w) => ids === null || ids.includes(w.id))
    .map((w) => ({ id: w.id, name: w.name, code: w.code }));
}
