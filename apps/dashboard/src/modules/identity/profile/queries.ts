import "server-only";

import { requireUser } from "../../core/guard.ts";
import * as profile from "./service.ts";

export async function getMyProfile() {
  const actor = await requireUser();
  return profile.getMyProfile(actor);
}

export async function getMyApiKeys() {
  const actor = await requireUser();
  return profile.listApiKeys(actor);
}

export async function getMyTransactions(opts: { page?: number } = {}) {
  const actor = await requireUser();
  return profile.listMyTransactions(actor, opts);
}
