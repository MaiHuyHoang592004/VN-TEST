import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as boms from "./service.ts";

export async function listBoms(filter: boms.BomFilter = {}) {
  const actor = await requirePermission("inventory.read");
  return boms.listBoms(actor, filter);
}

export async function getBom(id: number) {
  const actor = await requirePermission("inventory.read");
  return boms.getBom(actor, id);
}

export async function bomCoverage(filter: { search?: string; warehouseId?: number } = {}) {
  const actor = await requirePermission("inventory.read");
  return boms.bomCoverage(actor, filter);
}
