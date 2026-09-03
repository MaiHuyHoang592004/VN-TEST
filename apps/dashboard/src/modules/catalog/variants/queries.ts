import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as variants from "./service.ts";

export async function listVariants(query: variants.VariantListQuery = {}) {
  const actor = await requirePermission("products.read");
  return variants.listVariants(actor, query);
}

export async function getVariant(id: number) {
  const actor = await requirePermission("products.read");
  return variants.getVariant(actor, id);
}

export async function getVariantUsage(id: number) {
  const actor = await requirePermission("products.manage");
  return variants.getVariantUsage(actor, id);
}
