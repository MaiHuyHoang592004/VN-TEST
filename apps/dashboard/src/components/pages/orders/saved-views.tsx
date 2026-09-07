"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkPlus, Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { ORDER_VIEW_KEYS } from "./order-filters";

/**
 * Named views for the orders list.
 *
 * Nearly free, and that is the whole argument for building it: every piece of
 * this table's state — the filters, the sort, the page size, the density —
 * already lives in the URL, so a "view" is a query string with a name on it.
 * There is no view model, no server table, no sync problem.
 *
 * TWO KINDS, and the difference matters. The PRESETS are the platform's
 * vocabulary: four questions the floor asks every morning, spelled in statuses
 * that exist in modules/fulfillment/orders/status.ts and nowhere else. The
 * SAVED views are the operator's own, and live only in their browser.
 *
 * localStorage and not the database, deliberately: a saved view is a bookmark,
 * not a record. Nothing else depends on it, losing one costs a re-filter, and
 * putting it in Postgres would mean a table, a migration, a scope rule and a
 * sync path for something a user can rebuild in four clicks. The cost of that
 * choice is that views do not follow you to another machine, which the panel
 * states rather than hides.
 */

/**
 * The four presets, as URL fragments.
 *
 * EVERY status named here is a real `FulfillmentStatus`; the tabs are the
 * page's own canned sets (TABS in orders/page.tsx). Nothing invents a state:
 *
 *  · overdue         — there is NO server-side deadline filter (orderListWhere
 *                      windows `placedAt`, not `deadline`), and inventing one
 *                      in the client would mean filtering a page instead of a
 *                      query and lying about the count. So this preset SORTS
 *                      rather than filters: the work still in flight
 *                      (PENDING/ASSIGNED/IN_PRODUCTION — the `processing` tab),
 *                      soonest deadline first, which puts anything late at the
 *                      top of page one. `deadline` is in ORDER_SORT_KEYS and
 *                      the server orders nulls last, so orders with no deadline
 *                      sink instead of crowding the answer.
 *  · attention       — ON_HOLD. The one status that means a human stopped this
 *                      order and nothing moves it until another one acts.
 *  · readyToShip     — FULFILLED. Read straight off the transition map: the
 *                      only move forward from FULFILLED is SHIPPED, so
 *                      "produced, waiting for a label" is exactly this status
 *                      and not a phrase invented for the menu.
 *  · awaitingArtwork — PENDING. Also from the code rather than from wishes: the
 *                      artwork action in the row and the mobile card is drawn
 *                      only while `status === "PENDING"`, because the service
 *                      refuses artwork edits after that. PENDING therefore IS
 *                      the window in which artwork can still be attached.
 *
 * Oldest first on the two single-status presets: both are queues, and a queue
 * is worked from its head.
 */
const PRESETS = [
  { id: "overdue", query: "tab=processing&sort=deadline&dir=asc" },
  { id: "attention", query: "tab=attention" },
  { id: "readyToShip", query: "status=FULFILLED&sort=placedAt&dir=asc" },
  { id: "awaitingArtwork", query: "status=PENDING&sort=placedAt&dir=asc" },
] as const;

/**
 * VERSIONED KEY. The stored shape is `{id,name,query}[]`, and the day that
 * changes the old entries must be ignored rather than half-parsed — bumping to
 * `.v2` is one character and leaves the reader of `.v1` untouched.
 */
const STORAGE_KEY = "gwp.orders.views.v1";
/** A menu, not an archive. Twenty is already more than a popover can list
 * without scrolling, and the cap is what stops a runaway loop filling a user's
 * storage quota. */
const MAX_VIEWS = 20;
const MAX_NAME = 40;
/** Long enough for any real filter value (a search phrase, an ISO day, a cuid)
 * and short enough that a corrupted entry cannot become a megabyte URL. */
const MAX_VALUE = 200;

export type SavedView = { id: string; name: string; query: string };

/**
 * Everything that touches localStorage is wrapped, because every one of these
 * calls can THROW rather than return nothing: Safari's private mode throws on
 * `setItem`, a browser set to block site data throws on the getter itself, and
 * a full quota throws on write. A views menu is a convenience; it must never be
 * the reason the orders page fails to render.
 */
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The store is subscribed to rather than read during render.
 *
 * localStorage is an external mutable source, and reading one in a render body
 * is the impurity React's rules forbid — the same reason order-deadline.tsx
 * reads the clock this way. The snapshot is the RAW STRING, which is a
 * primitive and therefore referentially stable between renders; parsing it into
 * an array inside getSnapshot would hand React a new array every time and spin
 * forever. `null` on the server, so the first client render matches the HTML
 * and the list appears on the next tick instead of tripping hydration.
 */
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  // Another tab editing the same list is a real case — an operator with the
  // orders screen open twice — and `storage` is the only event that reports it.
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

const emit = () => listeners.forEach((listener) => listener());
const serverSnapshot = () => null;

/**
 * Keep only params this page actually reads, and cap what they carry.
 *
 * Stored views are DATA, not instructions: the string came out of a browser
 * store that anything running on this origin could have written, and it is
 * about to become a URL this app navigates to. Whitelisting against
 * ORDER_VIEW_KEYS means the worst a corrupted entry can do is filter the list
 * oddly.
 */
function sanitiseQuery(query: string): string {
  const source = new URLSearchParams(query);
  const clean = new URLSearchParams();
  for (const key of ORDER_VIEW_KEYS) {
    const value = source.get(key);
    if (value) clean.set(key, value.slice(0, MAX_VALUE));
  }
  return clean.toString();
}

/** Parse defensively: anything that is not a well-formed entry is dropped
 * rather than allowed to render as a broken row. */
function parseViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is SavedView =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as SavedView).id === "string" &&
          typeof (entry as SavedView).name === "string" &&
          typeof (entry as SavedView).query === "string",
      )
      .map((entry) => ({
        id: entry.id,
        name: entry.name.slice(0, MAX_NAME),
        query: sanitiseQuery(entry.query),
      }))
      .slice(0, MAX_VIEWS);
  } catch {
    return [];
  }
}

/** Returns false when the write was refused, so the caller can say so instead
 * of showing a list that will be empty again on reload. */
function writeViews(views: SavedView[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views.slice(0, MAX_VIEWS)));
    emit();
    return true;
  } catch {
    return false;
  }
}

/**
 * A canonical, order-independent form of a view's params, used only to decide
 * which entry to tick. `a=1&b=2` and `b=2&a=1` are the same view, and a preset
 * written in one order must still match a URL Next.js rebuilt in another.
 */
function signature(query: string): string {
  return [...new URLSearchParams(sanitiseQuery(query)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function SavedViews() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  /** Set when a write was REFUSED (private window, blocked site data, full
   * quota). The panel says so rather than showing a list that will be empty
   * again after a reload. */
  const [storageFailed, setStorageFailed] = useState(false);

  const raw = useSyncExternalStore(subscribe, readRaw, serverSnapshot);
  const views = useMemo(() => parseViews(raw), [raw]);

  /** What the screen is showing right now, in view terms. */
  const current = useMemo(() => sanitiseQuery(params.toString()), [params]);
  const currentSignature = useMemo(() => signature(current), [current]);

  /**
   * Apply a view by REPLACING every param a view owns, never by merging: a
   * merge would leave the last filter's `?status=` sitting under a preset that
   * says nothing about status, and the operator would get a list matching
   * neither. `page` goes too — a saved question starts at its first answer.
   */
  const apply = (query: string) => {
    const next = new URLSearchParams(params.toString());
    ORDER_VIEW_KEYS.forEach((key) => next.delete(key));
    next.delete("page");
    new URLSearchParams(sanitiseQuery(query)).forEach((value, key) => next.set(key, value));
    setOpen(false);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const save = () => {
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed) return;
    // Same name = the user is updating that view, not collecting duplicates.
    const rest = views.filter((view) => view.name.toLowerCase() !== trimmed.toLowerCase());
    const ok = writeViews([
      { id: `${Date.now()}-${trimmed.toLowerCase()}`, name: trimmed, query: current },
      ...rest,
    ]);
    setStorageFailed(!ok);
    if (ok) setName("");
  };

  const remove = (id: string) => {
    setStorageFailed(!writeViews(views.filter((view) => view.id !== id)));
  };

  const rowClass =
    "flex w-full items-center gap-2 rounded-(--radius-xs) px-2 py-1.5 text-left " +
    "text-(length:--fs-body-sm) text-(--text-body) " +
    "transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-50 " +
    "focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Bookmark className="size-4" />
            {t("orders.views.action")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <p className="text-(length:--fs-meta) font-bold tracking-(--ls-caps) uppercase text-(--text-label)">
          {t("orders.views.presets")}
        </p>
        <ul className="mt-1 flex flex-col">
          {PRESETS.map((preset) => {
            const active = signature(preset.query) === currentSignature;
            return (
              <li key={preset.id}>
                <button type="button" onClick={() => apply(preset.query)} className={rowClass}>
                  {/* The tick is the only state this list carries, so it holds
                      the row's width whether or not it is drawn — a list whose
                      labels shift left as the filters change reads as a
                      different list. */}
                  <Check
                    className={cn("size-4 shrink-0 stroke-(--action-600)", !active && "invisible")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`orders.views.preset.${preset.id}`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <Separator className="my-2" />

        <p className="text-(length:--fs-meta) font-bold tracking-(--ls-caps) uppercase text-(--text-label)">
          {t("orders.views.saved")}
        </p>
        {views.length === 0 ? (
          // The honest empty state, and it says WHERE they live: someone who
          // saved a view at home and cannot find it at work should learn why
          // here rather than report it as data loss.
          <p className="px-2 py-1.5 text-(length:--fs-body-sm) text-(--text-muted)">
            {t("orders.views.none")}
          </p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {views.map((view) => {
              const active = signature(view.query) === currentSignature;
              return (
                <li key={view.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => apply(view.query)}
                    className={cn(rowClass, "flex-1")}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0 stroke-(--action-600)",
                        !active && "invisible",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{view.name}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("orders.views.remove").replace("{name}", view.name)}
                    onClick={() => remove(view.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <Separator className="my-2" />

        {/* A real form so Enter submits — naming a view and then reaching for
            the mouse is the interaction this control exists to avoid. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            placeholder={t("orders.views.namePlaceholder")}
            aria-label={t("orders.views.name")}
            className="h-(--control-height-sm) flex-1 text-(length:--fs-body-sm)"
          />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            <BookmarkPlus className="size-4" />
            {t("orders.views.save")}
          </Button>
        </form>
        {storageFailed && (
          <p className="mt-2 text-(length:--fs-meta) text-(--status-critical-fg)">
            {t("orders.views.storageFailed")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
