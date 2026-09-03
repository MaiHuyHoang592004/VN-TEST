import "server-only";

import { requireUser } from "../../core/guard.ts";
import * as notifications from "./service.ts";

export async function getMyNotifications() {
  const actor = await requireUser();
  return notifications.listMine(actor);
}

/** First page of the /notifications archive; the client loads the rest. */
export async function getMyNotificationsPage() {
  const actor = await requireUser();
  return notifications.listMinePage(actor);
}
