import "server-only";

import { requirePermission } from "../../core/guard.ts";
import * as mockups from "./service.ts";

export async function listMockups(query: mockups.MockupListQuery = {}) {
  const actor = await requirePermission("mockups.manage");
  return mockups.listMockups(actor, query);
}

export async function getMockup(id: number) {
  const actor = await requirePermission("mockups.manage");
  return mockups.getMockup(actor, id);
}

export async function getMockupUsage(id: number) {
  const actor = await requirePermission("mockups.manage");
  return mockups.getMockupUsage(actor, id);
}
