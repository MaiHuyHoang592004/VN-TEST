import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as warehouses from "./service.ts";

export async function listWarehouses(opts: { includeInactive?: boolean } = {}) {
  const actor = await requirePermission("warehouses.read");
  return warehouses.listWarehouses(actor, opts);
}

export async function getWarehouse(id: number) {
  const actor = await requirePermission("warehouses.read");
  return warehouses.getWarehouse(actor, id);
}

export async function getWarehouseUsage(id: number) {
  const actor = await requirePermission("warehouses.manage");
  return warehouses.getWarehouseUsage(actor, id);
}
