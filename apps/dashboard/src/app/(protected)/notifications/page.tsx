import { getMyNotificationsPage } from "@/modules/platform/notifications/queries";
import { NotificationsList } from "@/components/pages/notifications/notifications-list";

/**
 * The archive behind the bell's "View All". The panel is a 30-column glance;
 * this pages through everything — read and unread alike — and is the one
 * place a notification can be deleted.
 */
export default async function NotificationsPage() {
  const { items, nextCursor } = await getMyNotificationsPage();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <NotificationsList initialItems={items} initialCursor={nextCursor} />
    </main>
  );
}
