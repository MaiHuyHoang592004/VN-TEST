/**
 * Guarded reads for server components. Reads are gated too — hiding a page in
 * the nav is UX, not access control.
 *
 * Note the two permissions: products.read is every role (sellers browse the
 * catalogue), products.manage is the admin screens. Usage counts sit behind
 * manage because they exist to answer "may I delete this".
 */
import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as products from "./service.ts";

export async function listProducts(query: products.ProductListQuery = {}) {
  const actor = await requirePermission("products.read");
  return products.listProducts(actor, query);
}

export async function getProduct(id: number) {
  const actor = await requirePermission("products.read");
  return products.getProduct(actor, id);
}

export async function getProductUsage(id: number) {
  const actor = await requirePermission("products.manage");
  return products.getProductUsage(actor, id);
}
