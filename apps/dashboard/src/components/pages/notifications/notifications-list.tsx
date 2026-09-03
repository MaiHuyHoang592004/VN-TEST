"use client";

/**
 * The /notifications archive: every notification, read and unread, newest
 * first, with delete.
 *
 * Three ways into the same delete, one per input the app actually meets:
 * swipe left (touch) reveals a destructive button, long-press (touch) reveals
 * the same one for people who don't know the swipe, and a hover/focus trash
 * covers mouse and keyboard. The reveal-then-tap IS the confirmation — there
 * is no undo, so nothing deletes on the first gesture alone.
 *
 * Local state updates first and the server write follows un-awaited, the same
 * contract the bell panel keeps: the column responds now, the round trip catches
 * up. The bell's own list is separate state refreshed by its 60s poll, so a
 * deletion here reaches the badge within a minute — chrome-grade freshness.
 */

import { useRef, useState } from "react";
import type { NotificationType } from "@opcreative/db";
import { CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useTranslation } from "@/lib/i18n";
import { useLocaleRouter } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  NOTIFICATION_META,
  type AppNotification,
  type NotificationCategory,
} from "@/components/global/layout/navbar/notifications/notification-data";
import {
  CATEGORY_COLOR,
  CATEGORY_ICON,
  TABS,
  fmt,
  relativeTime,
} from "@/components/global/layout/navbar/notifications/notification-render";
import {
  deleteNotificationAction,
  listNotificationsPageAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/modules/platform/notifications/actions";

/** Width of the revealed delete button; the swipe's whole travel. */
const REVEAL_PX = 80;
/** Past this on release the column snaps open, short of it snaps shut. */
const SNAP_PX = 40;
/** Movement below this is a tap, not a gesture. */
const SLOP_PX = 10;
const LONG_PRESS_MS = 500;

/** A tab's category, translated into the types the server speaks. */
const typesFor = (cat: NotificationCategory) =>
  (Object.keys(NOTIFICATION_META) as NotificationType[]).filter(
    (type) => NOTIFICATION_META[type].category === cat,
  );

export function NotificationsList({
  initialItems,
  initialCursor,
}: {
  initialItems: AppNotification[];
  initialCursor: string | null;
}) {
  const { t } = useTranslation();
  const router = useLocaleRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [tab, setTab] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  /** The one column whose delete is revealed — opening another closes it. */
  const [openId, setOpenId] = useState<string | null>(null);
  // Two quick tab switches race their responses; only the latest may land.
  const fetchSeq = useRef(0);

  const unread = items.filter((n) => !n.read).length;

  const tabTypes = (forTab: string) =>
    forTab === "all" ? undefined : typesFor(forTab as NotificationCategory);

  // The tabs filter on the SERVER, unlike the panel's filter over its 30 rows:
  // this page promises a tab's whole history, and filtering only the loaded
  // slice would present two payments as "all of them" while 200 sat unloaded.
  const switchTab = async (next: string) => {
    setTab(next);
    setOpenId(null);
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const page = await listNotificationsPageAction({ types: tabTypes(next) });
      if (fetchSeq.current !== seq) return; // a newer switch already answered
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch {
      toast.error(t("common.error"));
    } finally {
      if (fetchSeq.current === seq) setLoading(false);
    }
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsReadAction();
  };

  const activate = (n: AppNotification) => {
    // A tap while some other column sits open closes it instead of navigating —
    // the same contract every mail app keeps.
    if (openId && openId !== n.id) {
      setOpenId(null);
      return;
    }
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markNotificationReadAction(n.id);
    }
    if (n.href) router.push(n.href);
  };

  const deleteRow = (id: string) => {
    setOpenId((cur) => (cur === id ? null : cur));
    setItems((prev) => prev.filter((n) => n.id !== id));
    void deleteNotificationAction(id);
    toast.success(t("notifications.deleted"));
  };

  // Deleting rows never invalidates the cursor: it is an id bound, not an
  // offset, so "everything older than X" stays true however many rows remain.
  const loadMore = async () => {
    if (!cursor || loading) return;
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const page = await listNotificationsPageAction({ cursor, types: tabTypes(tab) });
      if (fetchSeq.current !== seq) return; // a tab switch superseded this page
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      toast.error(t("common.error"));
    } finally {
      if (fetchSeq.current === seq) setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{t("notifications.title")}</h1>
          {unread > 0 && (
            <span className="bg-vercel-blue/15 text-vercel-blue rounded-full px-1.5 py-0.5 text-[11px] font-medium">
              {unread} {t("notifications.unread")}
            </span>
          )}
        </div>
        <button
          onClick={markAllRead}
          disabled={unread === 0}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-sm text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <CheckCheck className="size-3.5" />
          {t("notifications.markAllRead")}
        </button>
      </div>

      {/* Same five tabs as the panel, same keys — one vocabulary. */}
      <Tabs
        value={tab}
        onValueChange={(v) => void switchTab(String(v))}
        className="mt-4 w-full"
      >
        <TabsList className="scrollbar-none h-8 w-full overflow-x-auto">
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key} className="flex-auto px-2 text-xs">
              {t(`notifications.tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="border-border mt-3 overflow-hidden rounded-lg border">
        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-16 text-center text-sm">
            {t("notifications.empty")}
          </p>
        ) : (
          <div className="divide-border divide-y">
            {items.map((n) => (
              <Row
                key={n.id}
                n={n}
                open={openId === n.id}
                onOpenChange={setOpenId}
                onDelete={deleteRow}
                onActivate={activate}
              />
            ))}
          </div>
        )}
      </div>

      {cursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loading}>
            {t("notifications.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

type Gesture = {
  x: number;
  y: number;
  dragging: boolean;
  press: ReturnType<typeof setTimeout> | null;
};

function Row({
  n,
  open,
  onOpenChange,
  onDelete,
  onActivate,
}: {
  n: AppNotification;
  open: boolean;
  onOpenChange: (id: string | null) => void;
  onDelete: (id: string) => void;
  onActivate: (n: AppNotification) => void;
}) {
  const { t } = useTranslation();
  /** Live translate while a finger is on the column; null = settled. */
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  // A drag or long-press still ends in a click event; this eats it so the column
  // doesn't also navigate.
  const suppressClick = useRef(false);
  const wasTouch = useRef(false);

  const meta = NOTIFICATION_META[n.type];
  const Icon = CATEGORY_ICON[meta.category];
  const base = open ? -REVEAL_PX : 0;
  const x = drag ?? base;

  const clearPress = () => {
    if (gesture.current?.press) {
      clearTimeout(gesture.current.press);
      gesture.current.press = null;
    }
  };

  const down = (e: React.PointerEvent) => {
    wasTouch.current = e.pointerType === "touch";
    suppressClick.current = false;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      dragging: false,
      // Long-press is the swipe for people who don't know the swipe.
      press:
        e.pointerType === "touch"
          ? setTimeout(() => {
              suppressClick.current = true;
              onOpenChange(n.id);
            }, LONG_PRESS_MS)
          : null,
    };
  };

  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.dragging) {
      if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
      clearPress();
      // Vertical intent belongs to the page scroll (touch-action: pan-y keeps
      // it native); we only claim the gesture once it is clearly horizontal.
      if (Math.abs(dx) <= Math.abs(dy)) {
        gesture.current = null;
        return;
      }
      g.dragging = true;
      suppressClick.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDrag(Math.max(-REVEAL_PX, Math.min(0, base + dx)));
  };

  const up = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    clearPress();
    if (!g?.dragging) return;
    onOpenChange(base + (e.clientX - g.x) < -SNAP_PX ? n.id : null);
    setDrag(null);
  };

  const cancel = () => {
    gesture.current = null;
    clearPress();
    setDrag(null);
  };

  const click = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (open) {
      onOpenChange(null);
      return;
    }
    onActivate(n);
  };

  return (
    <div className="group/column relative overflow-hidden">
      {/* Behind the column: the destructive half of the swipe. Tabbable only
          while revealed, so keyboard focus never lands on a hidden control. */}
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => onDelete(n.id)}
        className="bg-destructive absolute inset-y-0 right-0 flex w-20 items-center justify-center text-white"
      >
        <Trash2 className="size-4" />
        <span className="sr-only">{t("notifications.delete")}</span>
      </button>

      <div
        style={{ transform: `translateX(${x}px)`, touchAction: "pan-y" }}
        className={`bg-background relative ${drag === null ? "transition-transform duration-200" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          // Android raises contextmenu at long-press; ours already answered.
          if (wasTouch.current) e.preventDefault();
        }}
      >
        {/* A button, not a Link: iOS long-press on an anchor opens the native
            link preview at the same ~500ms our reveal fires. */}
        <button
          type="button"
          onClick={click}
          className={`flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors select-none [-webkit-touch-callout:none] hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none ${
            n.read ? "" : "bg-accent/30"
          }`}
        >
          <Icon className={`mt-0.5 size-4 shrink-0 ${CATEGORY_COLOR[meta.category]}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className={`truncate text-sm ${n.read ? "text-foreground/90" : "font-medium"}`}>
                {fmt(t(`notifications.items.${meta.key}.title`), n.values)}
              </p>
              <span className="text-muted-foreground shrink-0 text-[11px]">
                {relativeTime(n.createdAt, t)}
              </span>
            </div>
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
              {fmt(t(`notifications.items.${meta.key}.body`), n.values)}
            </p>
          </div>
          {!n.read && (
            <>
              <span
                aria-hidden="true"
                className="bg-vercel-blue mt-1.5 size-2 shrink-0 rounded-full"
              />
              <span className="sr-only">{t("notifications.unread")}</span>
            </>
          )}
        </button>
      </div>

      {/* The mouse's and keyboard's path to the same delete. Hidden where the
          pointer is a finger — swipe and long-press own that surface. */}
      <button
        type="button"
        aria-label={t("notifications.delete")}
        onClick={() => onDelete(n.id)}
        className="text-muted-foreground hover:text-destructive border-border bg-background absolute top-1/2 right-3 -translate-y-1/2 rounded-md border p-2 opacity-0 shadow-sm transition-opacity group-hover/column:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:hidden"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
