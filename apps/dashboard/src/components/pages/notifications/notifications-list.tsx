"use client";

/**
 * The /notifications archive: every notification, read and unread, newest
 * first, with delete.
 *
 * Two filters, and they are deliberately not the same kind. The category tab
 * asks the SERVER, because the page promises a category's whole history. The
 * "unread only" toggle is a client-side lens over the rows already loaded —
 * identical wording and identical snapshot semantics to the bell panel, so the
 * two surfaces cannot disagree about what "unread only" means.
 *
 * Three ways into the same delete, one per input the app actually meets:
 * swipe left (touch) reveals a destructive button, long-press (touch) reveals
 * the same one for people who don't know the swipe, and a hover/focus trash
 * covers mouse and keyboard. The reveal-then-tap IS the confirmation — there
 * is no undo, so nothing deletes on the first gesture alone. That last clause
 * used to be false for a POINTER, where hovering a row revealed a trash that
 * deleted on the first click; the pointer's trash now ARMS a labelled
 * destructive button, the same two steps in the shape a mouse expects.
 *
 * Local state updates first and the server write follows un-awaited, the same
 * contract the bell panel keeps: the column responds now, the round trip catches
 * up. The bell's own list is separate state refreshed by its 60s poll, so a
 * deletion here reaches the badge within a minute — chrome-grade freshness.
 */

import { useMemo, useRef, useState } from "react";
import type { NotificationType } from "@gwprint/db";
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
  const [unreadOnly, setUnreadOnly] = useState(false);
  // Ids read since the filter was switched on. Same contract as the bell panel:
  // marking read should dim a notification, not delete it from under the cursor
  // that just clicked it — so the unread filter runs against a snapshot, not
  // against live read state.
  const [readInPlace, setReadInPlace] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  /** The one column whose delete is revealed — opening another closes it. */
  const [openId, setOpenId] = useState<string | null>(null);
  // Two quick tab switches race their responses; only the latest may land.
  const fetchSeq = useRef(0);

  const unread = items.filter((n) => !n.read).length;

  // The unread filter is the one filter that does NOT go to the server. The
  // tab does, because a tab promises a category's whole history; "unread only"
  // is a lens over whatever is already on screen, so it composes with the tab
  // and with every page "Load more" appends without a refetch of its own.
  const visible = useMemo(
    () => items.filter((n) => !unreadOnly || !n.read || readInPlace.has(n.id)),
    [items, unreadOnly, readInPlace],
  );

  const toggleUnreadOnly = () => {
    // Switching the filter on starts a fresh snapshot, so it never lies about
    // what is still unread.
    if (!unreadOnly) setReadInPlace(new Set());
    setUnreadOnly((v) => !v);
    setOpenId(null);
  };

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
      // A new server page is a new snapshot: ids read under the previous tab
      // must not keep rows visible that this page never loaded.
      setReadInPlace(new Set());
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch {
      toast.error(t("common.error"));
    } finally {
      if (fetchSeq.current === seq) setLoading(false);
    }
  };

  const markAllRead = () => {
    setReadInPlace(
      (prev) => new Set([...prev, ...items.filter((n) => !n.read).map((n) => n.id)]),
    );
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
      setReadInPlace((prev) => new Set(prev).add(n.id));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markNotificationReadAction(n.id);
    }
    if (n.href) router.push(n.href);
  };

  /**
   * The optimistic delete, with the failure path it was missing.
   *
   * The row left the column before the server was asked and the success toast
   * fired regardless, so a failed write left a confirmation, a vanished row,
   * and the row back again on the next load. The write is caught now: the row
   * goes back where it was and the toast says so.
   *
   * The second step for a POINTER lives in <Row>: the hover trash arms, it does
   * not delete. Nothing here deletes on a first gesture, on any input.
   */
  const deleteRow = (id: string) => {
    const index = items.findIndex((n) => n.id === id);
    const row = items[index];
    if (!row) return;

    setOpenId((cur) => (cur === id ? null : cur));
    setItems((prev) => prev.filter((n) => n.id !== id));

    void deleteNotificationAction(id)
      .then(() => toast.success(t("notifications.deleted")))
      .catch(() => {
        setItems((prev) =>
          prev.some((n) => n.id === row.id)
            ? prev
            : [...prev.slice(0, index), row, ...prev.slice(index)],
        );
        toast.error(t("notifications.deleteFailed"));
      });
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
      {/* No <h1> here. NotificationsHeader's PageHeader is already the page's
          heading, and a second one repeating the same words is two h1s and the
          title printed twice. What is left is the count and the bulk action. */}
      <div className="flex items-center justify-between gap-2">
        {/* The count changes with no navigation, so it announces itself —
            otherwise "Mark all read" is silence to a screen reader. */}
        <p aria-live="polite" className="min-h-6">
          {unread > 0 && (
            <span className="bg-action-500/15 text-action-500 rounded-full px-1.5 py-0.5 text-[11px] font-medium">
              {unread} {t("notifications.unread")}
            </span>
          )}
        </p>
        {/* Real padding: this was a bare inline-flex about 16px tall, under the
            24x24 pointer-target floor WCAG 2.2 sets. */}
        <button
          type="button"
          onClick={markAllRead}
          disabled={unread === 0}
          className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1 rounded-(--radius-pill) px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
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

      {/* Unread lens over the loaded rows — the same control, wording and
          semantics as the bell panel, so the two surfaces cannot disagree.
          Selected is a FILL; unselected darkens on hover. */}
      <div className="mt-2">
        <button
          type="button"
          onClick={toggleUnreadOnly}
          aria-pressed={unreadOnly}
          className={`inline-flex min-h-8 items-center rounded-(--radius-pill) border px-3 py-1.5 text-(length:--fs-micro) font-semibold transition-colors duration-(--dur-fast) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none ${
            unreadOnly
              ? "border-transparent bg-sky-200 text-navy-700"
              : "border-(--border-hairline) text-navy-500 hover:bg-sky-100 hover:text-navy-700"
          }`}
        >
          {t("notifications.unreadOnly")}
        </button>
      </div>

      <div className="border-border mt-3 overflow-hidden rounded-lg border">
        {visible.length === 0 ? (
          <p className="text-muted-foreground px-4 py-16 text-center text-sm">
            {t("notifications.empty")}
          </p>
        ) : (
          <div className="divide-border divide-y">
            {visible.map((n) => (
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
  /**
   * The POINTER's reveal.
   *
   * Touch has two steps already — swipe or long-press reveals a destructive
   * button and the tap on THAT is the confirmation. A mouse had one: hover the
   * column, click the trash, gone, with only a toast afterwards. So the trash
   * arms rather than deletes, and the armed control is a labelled destructive
   * button; leaving the row, blurring it or pressing Escape disarms it.
   */
  const [armed, setArmed] = useState(false);
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
          className="flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors select-none [-webkit-touch-callout:none] hover:bg-sky-50 focus-visible:bg-sky-50 focus-visible:outline-none"
        >
          {/* Unread is a DOT, not a background tint: a tinted row competes with
              the status washes the rest of the app uses to mean something, and
              a whole column of them reads as an alert state nobody chose. */}
          <span
            aria-hidden="true"
            className={`mt-2 size-1.5 shrink-0 rounded-full ${
              n.read ? "bg-transparent" : "bg-(--status-attention-dot)"
            }`}
          />
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
                className="bg-action-500 mt-1.5 size-2 shrink-0 rounded-full"
              />
              <span className="sr-only">{t("notifications.unread")}</span>
            </>
          )}
        </button>
      </div>

      {/* The mouse's and keyboard's path to the same delete, in the same two
          steps the finger gets. Hidden where the pointer IS a finger — swipe
          and long-press own that surface. */}
      <div
        onMouseLeave={() => setArmed(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && armed) {
            e.stopPropagation();
            setArmed(false);
          }
        }}
        className="absolute top-1/2 right-3 -translate-y-1/2 pointer-coarse:hidden"
      >
        {armed ? (
          <button
            type="button"
            // Focus follows the reveal, so the keyboard path is two presses
            // rather than a hidden second control to hunt for.
            autoFocus
            onClick={() => onDelete(n.id)}
            onBlur={() => setArmed(false)}
            className="bg-destructive inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-3.5" />
            {t("notifications.confirmDelete")}
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("notifications.delete")}
            onClick={() => setArmed(true)}
            className="text-muted-foreground hover:text-destructive border-border bg-background rounded-md border p-2 opacity-0 shadow-sm transition-opacity group-hover/column:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
