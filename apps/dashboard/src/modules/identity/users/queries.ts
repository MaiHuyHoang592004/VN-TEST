/**
 * Guarded reads for server components. Reads are gated too — hiding a page in
 * the nav is UX, not access control.
 */
import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as users from "./service.ts";

export async function listUsers(query: users.UserListQuery = {}) {
  const actor = await requirePermission("users.read");
  return users.listUsers(actor, query);
}

export async function getUser(id: string) {
  const actor = await requirePermission("users.read");
  return users.getUser(actor, id);
}

export async function listInvites() {
  const actor = await requirePermission("users.read");
  return users.listInvites(actor);
}
