import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as receipts from "./service.ts";

export async function listReceipts(filter: receipts.ReceiptFilter = {}) {
  const actor = await requirePermission("inventory.read");
  return receipts.listReceipts(actor, filter);
}

export async function getReceipt(id: number) {
  const actor = await requirePermission("inventory.read");
  return receipts.getReceipt(actor, id);
}

export async function shipmentsReport(input: { upcomingDays?: number; warehouseId?: number } = {}) {
  const actor = await requirePermission("inventory.read");
  return receipts.shipmentsReport(actor, input);
}
