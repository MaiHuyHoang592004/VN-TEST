import "server-only";

import { requirePermission } from "../../core/guard.ts";
import type { EntryListQuery } from "./schema.ts";
import * as expenses from "./service.ts";

export async function listEntries(query: EntryListQuery = {}) {
  const actor = await requirePermission("expenses.manage");
  return expenses.listEntries(actor, query);
}

export async function listCategories() {
  const actor = await requirePermission("expenses.manage");
  return expenses.listCategories(actor);
}
