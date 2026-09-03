import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as stock from "./service.ts";

export async function listStock(filter: stock.StockFilter) {
  const actor = await requirePermission("inventory.read");
  return stock.listStock(actor, filter);
}

export async function listMovements(filter: stock.MovementFilter = {}) {
  const actor = await requirePermission("inventory.read");
  return stock.listMovements(actor, filter);
}
