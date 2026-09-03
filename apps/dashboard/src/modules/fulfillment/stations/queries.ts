import "server-only";

import { requirePermission } from "../../core/guard.ts";
import { getGroup, type GroupRef } from "./service.ts";
import { listTrackingGroups, type MonitorFilter } from "./service/monitor.ts";

/**
 * Guarded reads for the station pages. The permission is
 * orders.status.update, not a read permission: these screens exist to WORK
 * parcels, and someone who cannot move an order has no business at a station.
 * The scope inside each service call still decides which rows come back.
 */
export async function listGroups(
  opts: { filter?: MonitorFilter; cursor?: number; limit?: number } = {},
) {
  const actor = await requirePermission("orders.status.update");
  return listTrackingGroups(actor, opts);
}

/** One parcel, read-only — for a station page rendering without touching it. */
export async function getStationGroup(ref: GroupRef) {
  const actor = await requirePermission("orders.status.update");
  return getGroup(actor, ref);
}
