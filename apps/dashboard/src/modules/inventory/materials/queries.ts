import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as suppliers from "./service.ts";

export async function listMaterials(filter: suppliers.MaterialFilter = {}) {
  const actor = await requirePermission("inventory.read");
  return suppliers.listMaterials(actor, filter);
}

export async function listMaterialOptions(search?: string) {
  const actor = await requirePermission("inventory.read");
  return suppliers.listMaterialOptions(actor, search);
}
