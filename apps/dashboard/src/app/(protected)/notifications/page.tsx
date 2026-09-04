import { getMyNotificationsPage } from "@/modules/platform/notifications/queries";
import { NotificationsList } from "@/components/pages/notifications/notifications-list";
import { NotificationsHeader } from "@/components/pages/notifications/notifications-header";
import { Page } from "@/components/ds";

/**
 * The archive behind the bell's "View All". The panel is a 30-column glance;
 * this pages through everything — read and unread alike — and is the one
 * place a notification can be deleted.
 */
export default async function NotificationsPage() {
  const { items, nextCursor } = await getMyNotificationsPage();

  return (
    <Page className="max-w-2xl">
      <NotificationsHeader />
      <NotificationsList initialItems={items} initialCursor={nextCursor} />
    </Page>
  );
}
