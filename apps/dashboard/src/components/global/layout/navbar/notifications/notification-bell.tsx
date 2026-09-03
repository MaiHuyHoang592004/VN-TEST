/**
 * Notification bell + panel: unread badge, category tabs, unread-only filter,
 * per-item read state and "mark all read".
 *
 * Loads on OPEN, then POLLS while the tab is visible. Doc 05's stations are
 * why: a packer standing at a bench needs work to appear without navigating,
 * and until now the panel only refreshed when the page did.
 *
 * A 60s interval, not a socket. The master plan's P1 called this exactly: the
 * cheapest thing that removes the complaint is polling a query that already
 * exists, and a realtime vendor would be a new dependency for a problem an
 * interval solves. Paused when the tab is hidden — a laptop lid closed on a
 * dashboard should not bill queries all night — and refreshed the moment it
 * comes back, which is also when a returning user most expects it to be right.
 *
 * Read state is written through to the server and mirrored locally, so the
 * badge responds immediately instead of waiting for a round trip.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { NOTIFICATION_META, type AppNotification } from "./notification-data";
import { CATEGORY_COLOR, CATEGORY_ICON, TABS, fmt, relativeTime } from "./notification-render";
import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/modules/platform/notifications/actions";

/** Slow enough to be invisible on the bill, fast enough that a bench sees work
 * within a minute. Raise the cost before raising the frequency: an SSE stream
 * is the next step, not a shorter interval. */
const POLL_MS = 60_000;

export function NotificationBell() {
  const { t } = useTranslation();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  // Ids read since the filter was switched on. Marking read should dim a
  // notification, not delete it from under the cursor that just clicked it —
  // so the unread filter is applied to a snapshot, not to live read state.
  const [readInPlace, setReadInPlace] = useState<Set<string>>(new Set());

  const unreadCount = items.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    try {
      setItems(await listNotificationsAction());
    } catch {
      // A failed fetch leaves the panel empty rather than breaking the navbar
      // on every page — the bell is chrome, not the point of the screen.
    } finally {
      setLoaded(true);
    }
  }, []);

  // The interval and the return-to-tab refresh. `load` is stable, so this
  // subscribes once and the timer is cleared with the component.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter(
        (n) =>
          (tab === "all" || NOTIFICATION_META[n.type].category === tab) &&
          (!unreadOnly || !n.read || readInPlace.has(n.id)),
      ),
    [items, tab, unreadOnly, readInPlace],
  );

  // Local state updates first so the badge reacts immediately; the server write
  // follows and is not awaited.
  const markAllRead = () => {
    setReadInPlace(
      (prev) => new Set([...prev, ...items.filter((n) => !n.read).map((n) => n.id)]),
    );
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsReadAction();
  };
  const markRead = (id: string) => {
    setReadInPlace((prev) => new Set(prev).add(id));
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    void markNotificationReadAction(id);
  };
  const toggleUnreadOnly = () => {
    // Switching the filter on starts a fresh snapshot, so it never lies about
    // what's still unread.
    if (!unreadOnly) setReadInPlace(new Set());
    setUnreadOnly((v) => !v);
  };

  return (
    <Popover
      onOpenChange={(open) => {
        // Fetch on first open only — re-opening shows what we already have,
        // and marking read keeps it current without another round trip.
        if (open && !loaded) void load();
      }}
    >
      <PopoverTrigger
        render={
          <button
            aria-label={t("notifications.title")}
            className="border-border hover:border-foreground/20 hover:bg-accent/50 relative inline-flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        }
      >
        <Bell className="text-muted-foreground size-4" />
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} ${t("notifications.unread")}`}
            className="bg-action-500 absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        // Without this the positioner keeps its default 5px gutter and shifts
        // the 100vw mobile panel inside it, so it never sits flush. On desktop
        // the 380px panel never reaches an edge, so nothing changes there.
        collisionPadding={0}
        className="w-screen max-w-[100vw] rounded-none p-0 data-[side=bottom]:slide-in-from-top-6 sm:w-[380px] sm:max-w-[380px] sm:rounded-lg sm:data-[side=bottom]:slide-in-from-top-2 dark:bg-black"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Mobile: back arrow closes the full-width panel */}
            <PopoverClose
              render={
                <button
                  aria-label={t("notifications.back")}
                  className="text-muted-foreground hover:text-foreground -ml-1 inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
                />
              }
            >
              <ArrowLeft className="size-4" />
            </PopoverClose>
            <h3 className="text-sm font-semibold">{t("notifications.title")}</h3>
            {unreadCount > 0 && (
              <span className="bg-action-500/15 text-action-500 rounded-full px-1.5 py-0.5 text-[11px] font-medium">
                {unreadCount} {t("notifications.unread")}
              </span>
            )}
          </div>
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-sm text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" />
            {t("notifications.markAllRead")}
          </button>
        </div>

        {/* Category tabs + unread filter */}
        <div className="px-3 pb-2">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(String(v))}
            className="w-full"
          >
            {/* flex-auto, not flex-1: equal *gaps* around labels of unequal
                length, instead of equal boxes that crowd the long ones. */}
            <TabsList className="scrollbar-none h-8 w-full overflow-x-auto">
              {TABS.map((key) => (
                <TabsTrigger key={key} value={key} className="flex-auto px-2 text-xs">
                  {t(`notifications.tabs.${key}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="px-4 pb-2">
          <button
            onClick={toggleUnreadOnly}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              unreadOnly
                ? "border-action-500/40 bg-action-500/10 text-action-500"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("notifications.unreadOnly")}
          </button>
        </div>

        <Separator />

        {/* List */}
        <div className="max-h-[360px] overflow-y-auto">
          {visible.length === 0 ? (
            <p className="text-muted-foreground px-4 py-10 text-center text-sm">
              {t("notifications.empty")}
            </p>
          ) : (
            visible.map((n) => {
              const Icon = CATEGORY_ICON[NOTIFICATION_META[n.type].category];
              const rowClass = `hover:bg-accent/60 focus-visible:bg-accent/60 flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none ${
                n.read ? "" : "bg-accent/30"
              }`;
              const body = (
                <>
                  <Icon className={`mt-0.5 size-4 shrink-0 ${CATEGORY_COLOR[NOTIFICATION_META[n.type].category]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`truncate text-sm ${n.read ? "text-foreground/90" : "font-medium"}`}
                      >
                        {fmt(t(`notifications.items.${NOTIFICATION_META[n.type].key}.title`), n.values)}
                      </p>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {relativeTime(n.createdAt, t)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                      {fmt(t(`notifications.items.${NOTIFICATION_META[n.type].key}.body`), n.values)}
                    </p>
                  </div>
                  {!n.read && (
                    <>
                      <span
                        aria-hidden="true"
                        className="bg-action-500 mt-1.5 size-2 shrink-0 rounded-full"
                      />
                      <span className="sr-only">{t("notifications.unread")}</span>
                    </>
                  )}
                </>
              );
              return n.href ? (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => markRead(n.id)}
                  className={rowClass}
                >
                  {body}
                </Link>
              ) : (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={rowClass}
                >
                  {body}
                </button>
              );
            })
          )}
        </div>

        <Separator />
        <Link
          href="/notifications"
          className="text-muted-foreground hover:text-foreground focus-visible:bg-accent block px-4 py-2.5 text-center text-xs transition-colors focus-visible:outline-none"
        >
          {t("notifications.viewAll")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
