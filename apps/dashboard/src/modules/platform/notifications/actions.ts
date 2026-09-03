"use server";

import type { NotificationType } from "@opcreative/db";

import { requireUser } from "../../core/guard.ts";
import * as notifications from "./service.ts";

export async function markNotificationReadAction(id: string) {
  const actor = await requireUser();
  return notifications.markRead(actor, id);
}

export async function markAllNotificationsReadAction() {
  const actor = await requireUser();
  return notifications.markAllRead(actor);
}

/** Re-fetch for the panel. The bell is a client component that opens on demand,
 * so it pulls rather than receiving props from a server page it isn't under. */
export async function listNotificationsAction() {
  const actor = await requireUser();
  return notifications.listMine(actor);
}

/** The archive's paging and tab filter — cursor is the last column's id. */
export async function listNotificationsPageAction(
  opts: { cursor?: string; types?: NotificationType[] } = {},
) {
  const actor = await requireUser();
  return notifications.listMinePage(actor, opts);
}

export async function deleteNotificationAction(id: string) {
  const actor = await requireUser();
  return notifications.deleteOne(actor, id);
}
