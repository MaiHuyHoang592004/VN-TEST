import "server-only";

import { requireAnyPermission } from "../../core/guard.ts";
import type { TicketListQuery } from "./schema.ts";
import * as tickets from "./service.ts";

/**
 * One query for every role, exactly like orders: the SCOPE decides which rows
 * come back, so there is no listMyTickets / listAllTickets pair to drift apart.
 * The guard accepts either read grant — asking for `.own` alone would 403 the
 * support staff whose job this page is.
 */
const readGuard = () => requireAnyPermission("tickets.read.own", "tickets.read.all");

export async function listTickets(query: TicketListQuery = {}) {
  return tickets.listTickets(await readGuard(), query);
}

export async function getTicketDetail(id: number) {
  return tickets.getTicketDetail(await readGuard(), id);
}

export async function countOpenTickets() {
  return tickets.countOpenTickets(await readGuard());
}
