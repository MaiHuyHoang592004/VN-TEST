"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Image as ImageIcon, Package, Pencil, RefreshCw, Ban, StickyNote, FolderOpen } from "lucide-react";

import { DateRangeField, ProductCell, SegmentedControl, StatusBadge } from "@/components/ds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  useTableParams,
  type Column,
  type TableDensity,
} from "@/components/global/data-table";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/global/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  recalcOrdersAction,
  selectAllOrderIdsAction,
} from "@/modules/fulfillment/orders/actions";

import { OrderStatusActions } from "./order-status-actions";
import { OrderQr, orderQrProps } from "./order-qr";
import { OrderMobileCard } from "./order-mobile-card";
import { OrderProofAction } from "./order-proof-action";
import { OrderDeadline } from "./order-deadline";
import { OrderTrackingCell } from "./order-tracking";
import { Thumb, TaggedWell, WELL, designSlot } from "./order-thumb";
import { RefundDialog } from "./refund-dialog";
import { ArtworkDialog } from "./artwork-dialog";
import { StatusSummary, type StatusSummaryRow } from "./status-summary";
import { OrderTimeline } from "./order-timeline";
import { BuyLabelsButton } from "./buy-labels-button";
import { OrderMoreActions } from "./order-more-actions";
import { SavedViews } from "./saved-views";
import {
  ORDER_FILTER_KEYS,
  SELLER_PARAM,
  WAREHOUSE_PARAM,
  formatDayParam,
  hasOrderFilters,
  parseDayParam,
  readOrderFilter,
} from "./order-filters";
import { OrderDialog } from "./order-dialog";
import { VoidLabelDialog } from "./void-label-dialog";
import { AssignDialog } from "./assign-dialog";
import { ImportDialog } from "./import-dialog";
import { DeleteOrdersDialog } from "./delete-orders-dialog";
import { money } from "@/lib/money";

export type OrderRow = {
  id: number;
  externalId: string | null;
  marketplace: string | null;
  status: string;
  quantity: number;
  filled: number;
  paid: boolean;
  baseCost: string | null;
  placedAt: string;
  deadline: string | null;
  customerName: string | null;
  /** The seller's `User.id` (a cuid), carried so the Seller cell can filter to
   * it. The NAME cannot: two accounts may share a display name, and the query
   * takes an id. Already in ORDER_LIST_SELECT — the row simply never asked. */
  customerId: string | null;
  warehouseCode: string | null;
  /** The site's numeric id, for the same reason as `customerId`: the Site cell
   * filters by `?site=<id>` and the code is only what the cell prints. */
  warehouseId: number | null;
  productName: string | null;
  variantName: string | null;
  sku: string | null;
  /** The MOCKUP's stored image endpoint — already a `drive.google.com/
   *  thumbnail?id=` url, so it needs no resolving. */
  mockupThumbnail: string | null;
  /** The Drive folder that mockup was RESOLVED out of, or null when it was
   *  attached by hand. Equal to `designFolderId` means the design and the
   *  mockup are the same picture — see designSlot() in order-thumb.tsx. */
  mockupFolderId: string | null;
  /** "unresolved" once a folder has been tried and found unreadable; the
   *  stored memo that stops us asking Drive again on every render. */
  mockupStatus: string | null;
  /** `imageUrl`'s Drive folder id, parsed on the server. Null when the design
   *  is an ordinary uploaded image (or absent). */
  designFolderId: string | null;
  imageUrl: string | null;
  proofImageUrl: string | null;
  shipmentId: number | null;
  labelVoided: boolean;
  tracking: string | null;
  trackingStatus: string | null;
  /** Carrier name and its service level, e.g. "USPS" · "Ground Advantage". */
  carrier: string | null;
  service: string | null;
  /** The purchased label, shown as the row's third thumbnail. */
  labelUrl: string | null;
  /** What the carrier charged. Null until a label is bought. */
  shipCost: string | null;
  shipTo: string | null;
  note: string | null;
  internalNote: string | null;
  updatedAt: string;
  productVariantId: number | null;
  shippingName: string | null;
  shippingCompany: string | null;
  shippingEmail: string | null;
  shippingPhone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
};

/**
 * How many wells the strip draws before it collapses the rest behind "+N".
 *
 * A row can hold four pictures — design, mockup, label, packing proof — and
 * four of them plus their gaps is 140px of a column that also has to carry the
 * order id and up to three lines of text. Unbounded, the strip took the width
 * and the browser gave the primary key whatever was left, which is how the id
 * rendered as "416…" on row after row in production.
 *
 * Three SLOTS, not three pictures: at four, two are drawn and the last two go
 * behind one chip, so the strip is exactly the same width whether the row has
 * three pictures or four. Most rows now need at most three anyway — the design
 * and the mockup merge into one well whenever the mockup was resolved out of
 * the design's own folder.
 */
const MAX_WELLS = 3;

/**
 * The pinned row-action rail.
 *
 * The actions used to sit between the warehouse code and the placed date, and
 * at ~1150px of viewport both they and the date were off-screen to the right:
 * the six things an operator does to an order were unreachable without
 * horizontal scrolling. They now sit LAST and stay put while the rest of the
 * table scrolls under them.
 *
 * A sticky cell rather than an overflow menu: a frozen last column is exactly
 * what `position: sticky` is for, and it costs no extra click on the actions
 * people take most.
 *
 * WHICH SCROLLPORT IT PINS AGAINST MOVED, and the classes did not have to.
 * This was written when the card and ui/table's container were both
 * `overflow-x-auto` and the rail froze against the card. The table now passes
 * `stickyHeader`, which switches both of those wrappers to `overflow: visible`
 * so the pinned header is not captured by a box that never scrolls vertically —
 * and the horizontal scroll therefore moves to the PAGE. `right-0` is resolved
 * against whatever the nearest scrollport is, so the rail now holds against the
 * viewport's right edge instead of the card's. Same rule, same CSS, same
 * outcome for the reader: the six things an operator does to an order are never
 * scrolled out of reach.
 *
 * `z-10` DELIBERATELY RANKS BELOW THE STICKY HEADER, which is `z-20`. It used
 * to be the same rank, on the reasoning that the two only ever meet in the
 * actions HEADER cell — which reasons about the columns and misses the axis
 * pinning the header adds: every row's rail passes THROUGH the header band on
 * the way up the page, and two positioned boxes of equal rank are painted in
 * tree order, so `<tbody>` won. The result was an opaque rail with six live
 * buttons sitting on top of the column names, belonging to a row whose other
 * cells had correctly slid underneath. One rank apart and the rail goes under
 * the header like every other cell, while still holding the right edge against
 * the page.
 *
 * The three variants are not decoration. The row paints hover / open / selected
 * on the <tr>, and a pinned cell carrying its own opaque fill would sit there
 * stubbornly white while the rest of the row changed colour. There is no group
 * on the row to hook, so the cell restates the same three rules ui/table.tsx
 * applies — same tokens, scoped to `tbody` so hovering the header does not
 * paint the pinned header cell sky.
 */
const ACTIONS_CELL =
  "sticky right-0 z-10 bg-(--surface-data) " +
  "[tbody_tr:hover_&]:bg-sky-50 " +
  "[tbody_tr:has([aria-expanded=true])_&]:bg-sky-50 " +
  "[tbody_tr[data-state=selected]_&]:bg-sky-100";

/**
 * The order's pictures, corner-tagged: D design · M mockup · L label ·
 * P packing proof.
 *
 * D IS A PICTURE AGAIN. It used to be a folder icon on every single row,
 * because `imageUrl` is a Google Drive FOLDER (489/489 rows) and a folder url
 * in an <img> asks Drive for a login page and gets one. That was the right
 * answer while nothing could turn a folder into an image; the resolver chain
 * now exists end to end (libs/shared's parseDriveUrl/pickArtworkFile, libs/db's
 * resolveOrderMockup, and GET /api/orders/<id>/thumb as the lazy net), so the
 * row knows which of four cases it is in and draws accordingly. designSlot()
 * in order-thumb.tsx is where that decision lives, with the cases written out.
 *
 * In the merged case the tag still says D and the link still goes to the
 * FOLDER: the picture is the design, resolved out of its folder, and the folder
 * is still where a human goes to see all the print files at full size. The M
 * slot is suppressed for that row rather than drawing the identical square
 * twice.
 *
 * Each slot is drawn only when its image exists. A row with no artwork at all
 * keeps ONE empty cream well as the column's anchor, so the text beside it
 * starts at the same x on every row.
 */
function ArtworkStrip({ order }: { order: OrderRow }) {
  const { t } = useTranslation();
  const slot = designSlot(order);

  const linkClass =
    "block rounded-(--radius-xs) transition-opacity duration-(--dur-fast) ease-(--ease-out) hover:opacity-75 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none";

  // The honest answer for a folder we cannot draw — and the degrade target for
  // a lazy resolve that 404s, so a private folder never shows a broken glyph.
  const folderWell = (
    <span className={cn(WELL, "flex items-center justify-center")}>
      <FolderOpen className="size-4 stroke-(--icon-default)" aria-hidden />
      <span className="sr-only">{t("orders.thumb.designFolder")}</span>
    </span>
  );

  const wells: { key: string; label: string; node: ReactNode }[] = [];

  if (slot?.kind === "merged" || slot?.kind === "resolve") {
    const label = t(
      slot.kind === "merged" ? "orders.thumb.designInFolder" : "orders.thumb.design",
    );
    wells.push({
      key: "design",
      label,
      node: (
        <a
          href={slot.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={t("orders.thumb.designFolder")}
          className={linkClass}
        >
          <Thumb src={slot.src} tag="D" label={label} fallback={folderWell} />
        </a>
      ),
    });
  } else if (slot?.kind === "folder") {
    wells.push({
      key: "design",
      label: t("orders.thumb.designFolder"),
      node: (
        <a
          href={slot.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={t("orders.thumb.designFolder")}
          aria-label={t("orders.thumb.designFolder")}
          className={linkClass}
        >
          <TaggedWell tag="D">{folderWell}</TaggedWell>
        </a>
      ),
    });
  } else if (slot?.kind === "image") {
    // An uploaded image, rendered as itself — and clicking it opens the code
    // panel on its image view, as it always has.
    wells.push({
      key: "design",
      label: t("orders.thumb.design"),
      node: (
        <OrderQr
          {...orderQrProps(order)}
          initialFormat="image"
          trigger={<Thumb src={slot.src} tag="D" label={t("orders.thumb.design")} />}
        />
      ),
    });
  }

  // M — the customer-facing mockup. Suppressed when D already IS it.
  if (order.mockupThumbnail && slot?.kind !== "merged") {
    wells.push({
      key: "mockup",
      label: t("orders.thumb.mockup"),
      node: (
        <OrderQr
          {...orderQrProps(order)}
          initialFormat="image"
          trigger={<Thumb src={order.mockupThumbnail} tag="M" label={t("orders.thumb.mockup")} />}
        />
      ),
    });
  }

  if (order.labelUrl) {
    wells.push({
      key: "label",
      label: t("orders.thumb.label"),
      node: (
        <a
          href={order.labelUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={linkClass}
        >
          <Thumb src={order.labelUrl} tag="L" label={t("orders.thumb.label")} />
        </a>
      ),
    });
  }

  // The packed-parcel photo. Beside the others rather than instead of them: a
  // packer comparing design to parcel is why both exist. It goes through Thumb
  // like every sibling now — rendered raw, a dead link drew exactly the
  // broken-image glyph Thumb was written to prevent. Its green ring is not the
  // only signal; the tag and the alt text say what it is.
  if (order.proofImageUrl) {
    wells.push({
      key: "proof",
      label: t("orders.proof.thumb"),
      node: (
        <Thumb
          src={order.proofImageUrl}
          tag="P"
          label={t("orders.proof.thumb")}
          ring="ring-2 ring-(--status-success-dot)"
        />
      ),
    });
  }

  if (wells.length === 0) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <span className={cn(WELL, "flex items-center justify-center")}>
          <Package className="size-4 stroke-(--icon-muted)" aria-hidden />
        </span>
      </div>
    );
  }

  const capped = wells.length > MAX_WELLS;
  const visible = capped ? wells.slice(0, MAX_WELLS - 1) : wells;
  const hidden = capped ? wells.slice(MAX_WELLS - 1) : [];

  return (
    <div className="flex shrink-0 items-center gap-1">
      {visible.map((w) => (
        <span key={w.key}>{w.node}</span>
      ))}
      {hidden.length > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={t("orders.thumb.moreLabel").replace(
                  "{count}",
                  String(hidden.length),
                )}
                title={t("orders.thumb.more")}
                className={cn(
                  WELL,
                  "flex items-center justify-center font-mono text-(length:--fs-micro) font-bold text-(--text-body) transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-(--cream-300) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none",
                )}
              />
            }
          >
            +{hidden.length}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto">
            <p className="text-(length:--fs-meta) font-semibold text-(--text-body)">
              {t("orders.thumb.more")}
            </p>
            <div className="flex items-center gap-3">
              {hidden.map((w) => (
                <span key={w.key} className="flex flex-col items-center gap-1">
                  {w.node}
                  <span className="text-(length:--fs-micro) text-(--text-muted)">{w.label}</span>
                </span>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/**
 * A cell whose VALUE is a filter — the Seller and Site columns.
 *
 * Both columns had the same problem: on any screen wider than one seller's own
 * orders they print the same handful of names over and over, and the query
 * behind them (`customerId`, `warehouseId`) has accepted a filter since it was
 * written with nothing in the UI to set it. So the text becomes the control.
 *
 * A TOGGLE, not a one-way trip. Pressing the active value clears it, so the
 * cell is its own way back out and does not depend on the reader spotting the
 * Clear button — and it carries `aria-pressed`, because that is what it is: a
 * filter that is on or off, exactly like the header's FilterChip.
 *
 * `e.stopPropagation()` because the row is itself clickable (the expander), and
 * this is the same guard every other operable thing in a row uses.
 *
 * A null value renders the em-dash as plain text, never as a dead button: there
 * is nothing to filter to, and a control that does nothing is worse than none.
 */
function FilterCell({
  value,
  active,
  label,
  title,
  clearTitle,
  onToggle,
  className,
}: {
  value: string | null;
  /** The value currently in the URL, so the cell can tell "this one" from
   * "some other one". */
  active: string;
  label: string | null;
  title: string;
  clearTitle: string;
  onToggle: (next: string) => void;
  className?: string;
}) {
  if (!value || !label) {
    return <span className={cn("text-(--text-muted)", className)}>—</span>;
  }

  const isActive = active === value;
  return (
    <button
      type="button"
      aria-pressed={isActive}
      title={isActive ? clearTitle : title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(isActive ? "" : value);
      }}
      className={cn(
        "-mx-1 max-w-full truncate rounded-(--radius-xs) px-1 text-left",
        "transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none",
        "focus-visible:shadow-(--shadow-focus) focus-visible:outline-none",
        isActive
          ? "bg-sky-100 font-semibold text-(--text-body)"
          : "text-(--text-muted) hover:bg-sky-50 hover:text-(--text-body)",
        className,
      )}
    >
      {label}
    </button>
  );
}

const STATUSES = [
  "PENDING",
  "ASSIGNED",
  "IN_PRODUCTION",
  "FULFILLED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "ON_HOLD",
] as const;

export function OrdersTable({
  rows,
  total,
  summary,
  warehouses,
}: {
  rows: OrderRow[];
  total: number;
  /** The floor's status cards. Empty for anyone who does not work orders —
   * the page decides, so a seller never pays for the query. */
  summary: StatusSummaryRow[];
  warehouses: { id: number; code: string; name: string }[];
}) {
  const params = useTableParams();
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();
  // Read directly, and only for the date range: it is the one control here that
  // has to write TWO params in a single navigation — see setDateRange.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dateRangePending, startDateRange] = useTransition();
  const [refunding, setRefunding] = useState(false);
  const [artworkFor, setArtworkFor] = useState<OrderRow | null>(null);
  const [recalcPending, setRecalcPending] = useState(false);

  /** Shared by the column button and the bulk one — the difference is only which
   * ids go in. */
  const recalc = async (ids: number[]) => {
    setRecalcPending(true);
    const result = await recalcOrdersAction(ids);
    setRecalcPending(false);
    // "Already charged" is a refusal with a reason, not a failure: the money
    // moved, so a refund is the tool.
    if (result.ok === false) {
      toast.error(t(`orders.recalc.${result.error}`));
      return;
    }
    toast.success(
      t("orders.recalc.done")
        .replace("{updated}", String(result.updated))
        .replace("{skipped}", String(result.skipped)),
    );
    clearSelection();
    router.refresh();
  };
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [voidingLabelFor, setVoidingLabelFor] = useState<OrderRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * MEMOISED, and not for speed. AssignDialog, RefundDialog and BuyLabelsButton
   * each take this array as an effect dependency and re-run a server-side
   * PREVIEW when it changes. Rebuilt inline it was a new array identity on every
   * render of this component, so any unrelated re-render while one of those
   * dialogs was open fired the preview action again.
   */
  const selectedIds = useMemo(() => [...selected].map(Number), [selected]);
  /** Drops the wider claim as well as the ids: leaving `allMatching` set after
   * an empty selection would keep DataTable's strip announcing "all N matching
   * rows are selected" over nothing at all. */
  const clearSelection = () => {
    setSelected(new Set());
    setAllMatching(false);
    setSelectionCapped(false);
  };

  // Who may see money on this table. `canCharge` is the platform side; the
  // second is the seller side, recognised by SCOPE rather than by role name —
  // a viewer who can read only their own orders can only ever be looking at
  // their own money.
  const canCharge = can("orders.assign");
  /**
   * Whether this reader has ANY bulk action at all — the three gates the
   * `bulkActions` slot contains, ORed.
   *
   * It decides whether the slot is passed, not just what is inside it, and
   * that distinction matters: DataTableToolbar REPLACES the filters with
   * bulkActions whenever a selection exists and the prop is present. Passing a
   * fragment whose every child is gated away would leave a read-only viewer who
   * ticked a row looking at "3 selected" and nothing else, with the status
   * filter and the date range gone from under them. Undefined instead, so that
   * reader gets exactly the toolbar they had before.
   */
  const canBulk =
    can("orders.status.update") || can("orders.labels.manage") || can("orders.assign");
  const ownScopeOnly =
    can("orders.read.own") && !can("orders.read.customer") && !can("orders.read.all");

  const status = params.get("status");

  /**
   * ONE LIST, TWO USES — and that is the whole fix.
   *
   * `hasFilters` used to be `Boolean(params.get("q") || status)` and the clear
   * call `clearFilters(["q", "status"])`, so `tab`, the site, the seller and the
   * date window neither lit the Clear button up nor were removed by it: the
   * operator pressed Clear, the list stayed filtered, and nothing said why.
   * Both expressions now read ORDER_FILTER_KEYS (order-filters.ts), so the next
   * filter added cannot fall out of step with either — it has to be added to
   * the array to work at all.
   */
  const hasFilters = hasOrderFilters((key) => params.get(key));
  const clearAllFilters = () => params.clearFilters([...ORDER_FILTER_KEYS]);

  /** The placedAt window, `?from=`/`?to=` as YYYY-MM-DD. Parsed into LOCAL
   * dates for the picker — see parseDayParam for why `new Date(str)` is wrong
   * here. */
  const from = parseDayParam(params.get("from"));
  const to = parseDayParam(params.get("to"));

  /**
   * BOTH ENDS IN ONE NAVIGATION, and this is not a style preference.
   *
   * `params.setFilter` rebuilds the query string from the `useSearchParams`
   * snapshot it closed over, so two calls in the same handler both start from
   * the URL as it was BEFORE either of them — the second push overwrites the
   * first and only `to` survives. The picker hands back the whole range at
   * once, so it is written at once. The transition is local for the same reason
   * useTableParams runs its own: the rows already on screen stay there and dim
   * rather than being replaced by a skeleton.
   */
  const setDateRange = (range: { from?: Date; to?: Date }) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of [
      ["from", formatDayParam(range.from)],
      ["to", formatDayParam(range.to)],
    ] as const) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // A new window makes the old page number meaningless — the same rule every
    // setter in useTableParams follows.
    next.delete("page");
    startDateRange(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const siteFilter = params.get(WAREHOUSE_PARAM);
  const sellerFilter = params.get(SELLER_PARAM);

  /**
   * "Every order matching this filter", not "every order on this page".
   *
   * `selectingAll` is the pending flag while the server enumerates the ids, and
   * `allMatching` is what flips DataTable's strip to its "N are selected ·
   * Clear" state afterwards.
   */
  const [selectingAll, setSelectingAll] = useState(false);
  const [allMatching, setAllMatching] = useState(false);
  /**
   * Whether the wider selection the strip is announcing is only the FIRST
   * MAX_SELECTION_IDS of the match.
   *
   * Kept as state rather than left to the toast, because the toast is a
   * transient surface and the strip is the one still on screen when Refund or
   * Delete is pressed. It said "All 5,312 matching rows are selected" over two
   * thousand ids — the exact silence `listOrderIds` returns `capped` to
   * prevent.
   */
  const [selectionCapped, setSelectionCapped] = useState(false);

  /**
   * A claim about "all 5,312 matching" is only true of the filter it was made
   * under, so changing the filter has to retract it.
   *
   * Adjusted DURING render rather than in an effect — React's documented
   * pattern for state derived from props, and the same one DataTableToolbar
   * uses to re-sync its search draft. An effect would paint one frame of a
   * banner claiming a total that belongs to the previous query. Only the
   * wider claim is dropped; a hand-ticked selection surviving a filter change
   * is existing behaviour and not this task's to change.
   */
  // JSON rather than a joined string: a search phrase containing the separator
  // would otherwise make two different filters compare equal.
  const filterKey = JSON.stringify(ORDER_FILTER_KEYS.map((key) => params.get(key)));
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    if (allMatching) {
      setAllMatching(false);
      setSelectionCapped(false);
      setSelected(new Set());
    }
  }

  /**
   * Ask the server for every id the current filter matches.
   *
   * THE FILTER IS READ BY readOrderFilter, not rebuilt here, and that is the
   * fix for a whole family of bugs rather than a tidy-up. This call used to
   * name the params by hand — q, status, site, seller, from, to — and the page
   * that produced `total` named a different set: it also resolved `?tab=` to a
   * status list, also accepted the legacy `?customer=` spelling of the site,
   * and bounded `?to=` at the last instant of the day rather than its first.
   * So on `/orders?tab=attention` the strip offered "Select all 30 matching"
   * and the action came back with two thousand ids in every status, which then
   * fed Delete, Refund and Assign. One reader, one answer.
   *
   * The DATES GO AS STRINGS, deliberately: `OrderSelectionFilter` takes them
   * and parses them server-side with the same parseDateParam the page uses, so
   * an unparseable value is ignored instead of crossing the boundary as an
   * Invalid Date and 500-ing the action.
   */
  const selectAllMatching = async () => {
    setSelectingAll(true);
    const toastId = toast.loading(t("orders.selectAll.pending"));
    try {
      const result = await selectAllOrderIdsAction(readOrderFilter((key) => params.get(key)));
      setSelected(new Set(result.ids.map(String)));
      setAllMatching(true);
      setSelectionCapped(result.capped);
      // CAPPED IS SAID OUT LOUD. A refund or a delete on "all of them" that
      // quietly meant "the first 2000 of them" is the kind of silence that
      // costs money, so the toast names both figures and stays until dismissed
      // — and `selectionCapped` says the same thing in the strip, which is the
      // surface still on screen when the destructive button is pressed.
      if (result.capped) {
        toast.warning(
          t("orders.selectAll.capped", { count: result.ids.length, total: result.total }),
          { id: toastId, duration: Infinity },
        );
      } else {
        toast.success(t("orders.selectAll.done", { count: result.ids.length }), {
          id: toastId,
        });
      }
    } catch {
      toast.error(t("orders.selectAll.failed"), { id: toastId });
    } finally {
      setSelectingAll(false);
    }
  };

  /**
   * SORTABLE COLUMNS ARE THE BACKEND'S WHITELIST, AND THE ID IS THE KEY.
   *
   * `Column.id` is what DataTable posts as `?sort=`, and service/reads.ts
   * checks it against ORDER_SORT_KEYS — so a column id is an API parameter,
   * not a React key. Two of them used to be each other's: the column rendering
   * `customerName` was `id: "warehouse"` and the one rendering `warehouseCode`
   * was `id: "customer"`. Harmless while nothing read them; the moment sorting
   * landed, clicking "Seller" would have asked the server to sort by warehouse.
   * They are now named after what they render, and every `sortable: true`
   * column below spells a key the whitelist actually contains.
   */
  const columns: Column<OrderRow>[] = [
    {
      id: "order",
      header: t("orders.colOrder"),
      // A WIDTH FLOOR, because this column carries the table's primary key and
      // was losing. With up to four thumbnails and four lines of text and no
      // minimum, the browser handed the order id whatever was left over and it
      // rendered as "416…" in production. 18rem is the strip (three slots) plus
      // room for a full external id.
      className: "min-w-72",
      cell: (o) => (
        <div className="flex min-w-0 items-start gap-3">
          <ArtworkStrip order={o} />

          <div className="min-w-0">
            {/* NOT truncated, and nowrap: this is a mono identifier, and half
                of one identifies nothing. It is the column's width floor above
                that buys the room for it. */}
            <p className="font-mono text-(length:--fs-meta) font-medium whitespace-nowrap tracking-(--ls-mono) text-(--text-body)">
              {o.externalId ?? `#${o.id}`}
            </p>
            <p className="truncate text-(length:--fs-meta) text-(--text-muted)">
              {o.marketplace ?? t("orders.noMarketplace")}
            </p>
            {/* Third line: the note. The customer's note reads as ordinary
                meta; the INTERNAL note is orange and ops-only, because the
                schema says in as many words that it is never shown to the
                customer. title= carries the full text for a note longer than
                the column.

                Both drop out at `compact`. A dense row that is merely a
                shorter version of the same four lines is not denser — the
                point of the setting is more orders on screen, and the notes
                are the two lines a scanning operator is not reading. */}
            {o.note && (
              <p
                title={o.note}
                className="flex items-center gap-1 truncate text-(length:--fs-meta) text-(--text-muted) group-data-[density=compact]/data-table:hidden"
              >
                <StickyNote className="size-3 shrink-0 stroke-(--icon-muted)" aria-hidden />
                <span className="truncate">{o.note}</span>
              </p>
            )}
            {o.internalNote && can("orders.status.update") && (
              <p
                title={o.internalNote}
                className="flex items-center gap-1 truncate text-(length:--fs-meta) text-(--status-attention-fg) group-data-[density=compact]/data-table:hidden"
              >
                <StickyNote className="size-3 shrink-0 stroke-(--status-attention-dot)" aria-hidden />
                <span className="truncate">{o.internalNote}</span>
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "variant",
      header: t("orders.colProduct"),
      // The DS's product cell: name, SKU in mono, variant on the meta line.
      // No image — the artwork thumbnail is the ORDER column's, where it is a
      // trigger, and one product per cell means one thumbnail per row.
      cell: (o) => (
        <ProductCell
          size="sm"
          name={o.productName ?? "—"}
          code={o.sku}
          meta={o.variantName}
        />
      ),
    },
    {
      id: "customerName",
      header: t("orders.colCustomer"),
      sortable: true,
      hideOnMobile: true,
      // Only meaningful to someone who can see across accounts; a seller's own
      // orders are all theirs — which is exactly why the cell is a FILTER now.
      // `listOrders` has always accepted `customerId` and nothing exposed it,
      // so on an admin's screen this column repeated the same twenty names down
      // the page and there was no way to say "just this one". Clicking it
      // writes `?seller=<id>`; the Clear button (which now covers every filter)
      // is the way back out.
      cell: (o) => (
        <FilterCell
          value={o.customerId}
          active={sellerFilter}
          label={o.customerName}
          title={t("orders.filterBySeller")}
          clearTitle={t("orders.filterClearSeller")}
          onToggle={(next) => params.setFilter(SELLER_PARAM, next)}
          className="text-(length:--fs-body-sm)"
        />
      ),
    },
    {
      id: "quantity",
      header: t("orders.colQty"),
      sortable: true,
      className: "text-right tabular-nums",
      cell: (o) => (
        <span className="font-mono text-(length:--fs-body-sm) tracking-(--ls-mono)">
          {o.filled > 0 ? `${o.filled}/${o.quantity}` : o.quantity}
        </span>
      ),
    },
    {
      id: "status",
      header: t("orders.colStatus"),
      sortable: true,
      // The colour comes from STATUS_TONES via the raw status, so this badge
      // and the summary strip above can never disagree about a status. The
      // label stays the translated string.
      cell: (o) => (
        <StatusBadge status={o.status}>{t(`orders.statuses.${o.status}`)}</StatusBadge>
      ),
    },
    {
      // Next to the status, because the two are read as one question: where is
      // this order, and how much time has it got. Everything about the phrasing
      // and the severity rule lives in order-deadline.tsx.
      id: "deadline",
      header: t("orders.deadline.column"),
      sortable: true,
      hideOnMobile: true,
      cell: (o) => <OrderDeadline deadline={o.deadline} status={o.status} />,
    },
    {
      id: "tracking",
      header: t("orders.colTracking"),
      hideOnMobile: true,
      cell: (o) => (
        <OrderTrackingCell
          tracking={o.tracking}
          carrier={o.carrier}
          service={o.service}
          trackingStatus={o.trackingStatus}
        />
      ),
    },
    {
      id: "warehouseCode",
      header: t("orders.colWarehouse"),
      sortable: true,
      hideOnMobile: true,
      // Same story as Seller: `warehouseId` was already a query parameter with
      // no control behind it. `?site=` and not `?customer=` — see order-
      // filters.ts for why that param was renamed rather than left alone.
      cell: (o) => (
        <FilterCell
          value={o.warehouseId === null ? null : String(o.warehouseId)}
          active={siteFilter}
          label={o.warehouseCode}
          title={t("orders.filterBySite")}
          clearTitle={t("orders.filterClearSite")}
          onToggle={(next) => params.setFilter(WAREHOUSE_PARAM, next)}
          className="font-mono text-(length:--fs-meta) tracking-(--ls-mono)"
        />
      ),
    },
    // MONEY IS GATED, and the gate has two doors rather than one.
    //
    // It briefly had none. Dropping the orders.assign check to "show sellers
    // what they were billed" also handed the column to every other role that
    // can read orders — and orders.assign is exactly the permission WAREHOUSE,
    // SUPPORT and DESIGNER lack (libs/shared/src/access/permissions.ts). A
    // packer would have seen the charge on every seller shipping through their
    // site; a designer, on every order on the platform. permissions.test.ts
    // asserts that in as many words: "line staff cannot charge".
    //
    // So: staff who CHARGE see it (orders.assign), and the seller BEING charged
    // sees it — recognised by scope, not by role name. Somebody whose read
    // scope is their own orders and nothing wider is, definitionally, only ever
    // looking at their own money.
    ...(canCharge || ownScopeOnly
      ? [
          {
            // Header follows what is actually in the column: a seller sees one
            // figure, so promising "+ ship" would be a header describing a line
            // that never renders for them.
            //
            // `baseCost` and not "cost": the id is the sort key, and baseCost is
            // the column the server can actually order by. Shipping is a
            // different table's number and is not sortable here.
            id: "baseCost",
            header: canCharge ? t("orders.colCostShip") : t("orders.colCost"),
            sortable: true,
            className: "text-right tabular-nums",
            hideOnMobile: true,
            cell: (o: OrderRow) => (
              <div className="whitespace-nowrap">
                <p className="font-mono text-(length:--fs-body-sm) tracking-(--ls-mono) text-(--text-body)">
                  {money(o.baseCost)}
                </p>
                {/* SHIPPING IS NOT THE SELLER'S LINE. Shipment.cost is what the
                    carrier charged the PLATFORM when the label was bought —
                    modules/fulfillment/labels/purchase.ts writes it to the
                    shipment and creates no seller transaction; the seller is
                    debited baseCost alone (orders/service/assign.ts). Showing
                    it to them under their own cost would be presenting the
                    platform's expense as their bill. */}
                {canCharge && o.shipCost ? (
                  <p className="font-mono text-(length:--fs-micro) tracking-(--ls-mono) text-(--text-muted)">
                    + {money(o.shipCost)}
                  </p>
                ) : null}
              </div>
            ),
          } satisfies Column<OrderRow>,
        ]
      : []),
    {
      id: "placedAt",
      header: t("orders.colPlaced"),
      sortable: true,
      hideOnMobile: true,
      // IN UTC, like the filter above it. `?from=`/`?to=` are bounded as UTC
      // days (page.tsx), and a bare toLocaleDateString() renders in the
      // VIEWER's zone — so at UTC+7, the app's primary operator locale, seven
      // hours of every day printed the wrong date and the operator saw rows
      // dated 8 Sep inside a 7 Sep–7 Sep filter while rows dated 7 Sep were
      // missing. This is the same UTC-both-sides convention order-deadline.tsx
      // already uses, and it removes an SSR/client hydration mismatch on the
      // same cell for free.
      cell: (o) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">
          {new Date(o.placedAt).toLocaleDateString(undefined, { timeZone: "UTC" })}
        </span>
      ),
    },
    // The floor's row actions, LAST and PINNED — see ACTIONS_CELL for why.
    // Only for people who actually work orders: a seller has no scanner and no
    // printer in this loop, so the rail would be a decoration that costs them
    // horizontal space it now permanently occupies.
    ...(can("orders.status.update")
      ? [
          {
            id: "actions",
            header: t("orders.colActions"),
            hideOnMobile: true,
            className: ACTIONS_CELL,
            cell: (o: OrderRow) => (
              <div className="flex items-center gap-1">
                <OrderQr {...orderQrProps(o)} />
                <OrderProofAction orderId={o.id} hasProof={Boolean(o.proofImageUrl)} />
                {/* Always available — the service itself decides what a
                    non-PENDING order still allows (quantity locks after
                    PENDING, most fields lock after CANCELLED) and reports
                    that back as a field/form error rather than the button
                    guessing and hiding fields that would have been fine. */}
                <Can permission="orders.update">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("orders.edit")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(o);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </Can>
                {/* Only when there is a live label to cancel — a voided one
                    already shows nothing here, and this button is not how
                    a NEW label gets bought (Buy labels handles that). */}
                {o.shipmentId && !o.labelVoided && o.tracking && (
                  <Can permission="orders.labels.manage">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("orders.labels.voidTitle")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setVoidingLabelFor(o);
                      }}
                    >
                      <Ban className="size-4" />
                    </Button>
                  </Can>
                )}
                {/* Artwork is only editable while the order is PENDING — the
                    service refuses later, so the button follows it. */}
                {o.status === "PENDING" && (
                  <Can permission="orders.update">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("orders.artwork.title")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setArtworkFor(o);
                      }}
                    >
                      <ImageIcon className="size-4" />
                    </Button>
                    {/* One column, one re-price. The bulk button does the same
                        call — this is for the single order somebody is
                        looking at, which is how it is used in practice. */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("orders.recalc.action")}
                      disabled={recalcPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        void recalc([o.id]);
                      }}
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  </Can>
                )}
              </div>
            ),
          } satisfies Column<OrderRow>,
        ]
      : []),
  ];

  return (
    <>
      <StatusSummary rows={summary} />

      {/* `params.pending` DIMS the table, it does not blank it. useTableParams
          runs the navigation in a transition precisely so the rows that are
          already on screen stay there; feeding `pending` to DataTable's
          `loading` threw them away and flashed a skeleton on every search
          keystroke, status change and page turn. aria-busy tells AT the same
          thing without removing the content it is reading. */}
      {/* `selectingAll` joins `params.pending` here rather than getting a
          spinner of its own: DataTable's select-all strip has no pending slot,
          and enumerating a few thousand ids is exactly the same kind of wait as
          a page turn — the table dims, aria-busy says so, and the sonner toast
          the action raised names what is happening. */}
      <div
        aria-busy={params.pending || selectingAll || dateRangePending || undefined}
        className={
          params.pending || selectingAll || dateRangePending
            ? "opacity-60 transition-opacity duration-(--dur-fast) motion-reduce:transition-none"
            : "transition-opacity duration-(--dur-fast) motion-reduce:transition-none"
        }
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowId={(o) => String(o.id)}
          rowLabel={(o) => o.externalId ?? `#${o.id}`}
          // Server-driven, like every other bit of this table's state: the id
          // of a sortable column IS the `?sort=` the page hands listOrders.
          sort={params.sort}
          onSortChange={params.setSort}
          // The cells read this back off the root as `data-density`, which is
          // how the artwork wells shrink and the note lines drop without any
          // prop reaching them.
          density={params.density}
          /*
           * PINNED AT THE NAV, not at 0. `--nav-height` (64px, gwp.theme.css)
           * is the real height of the app bar, which is itself `sticky top-0`
           * — so `top: 0` would slide the column names underneath it and the
           * header would be pinned out of sight. The DS names this screen
           * specifically: readme.md's AdminOrders entry is "a frameless
           * DataTable (surface="field", sticky white header pinned at
           * --nav-height)". Passed as `var(--nav-height)` rather than 64px so
           * a change to the bar's height moves this with it.
           *
           * THE COST, stated because it is real and because the previous pass
           * on this file deliberately left the prop off over it: DataTable
           * cannot pin a header inside a horizontally-scrolling box (a sticky
           * position resolves against the nearest scrollport, and both the card
           * and ui/table's container are `overflow-x-auto`), so turning this on
           * switches both to `overflow: visible` and a too-wide table scrolls
           * at PAGE level instead of inside the card.
           *
           * The pinned actions rail survives that: `position: sticky` on the
           * last cell now resolves against the page rather than the card, so
           * `right-0` holds it against the viewport's right edge instead of the
           * card's — the rail still never scrolls away, which is the whole
           * point of it. Both stick states also land on the actions HEADER
           * cell, which takes `col.className` too, so that one cell is pinned
           * in both axes and stays in the corner where its column is.
           *
           * Two consequences of the move that had to be paid for rather than
           * argued away, both in DataTable: the card is sized to its CONTENT
           * (`w-max min-w-full`) so the white ground still reaches under the
           * rows now that <Page>'s 1120px band no longer clips them, and the
           * header outranks the rail (`z-20` against `z-10`) so a row's pinned
           * cell passes UNDER the column names on its way up rather than over
           * them. globals.css carries the matching scroll padding, so tabbing
           * to a cell control does not park it behind either pinned edge.
           */
          stickyHeader="var(--nav-height)"
          /*
           * SELECT-ALL-MATCHING, the four props behind DataTable's strip.
           * `total` is the server's count for this exact filter, which is what
           * makes "select all 5,312 matching" a promise the page can keep: the
           * action re-runs the SAME where builder the list used, so an id can
           * only come back if paging to it would have found the same row.
           */
          matchCount={total}
          allMatchingSelected={allMatching}
          // The cap is the strip's business as much as the toast's — see
          // `selectionCapped` above.
          selectionCapped={selectionCapped}
          onSelectAllMatching={() => void selectAllMatching()}
          onClearSelection={clearSelection}
          mobileCard={(o) => (
            <OrderMobileCard
              order={o}
              // The phone gets the SAME row actions the desktop row does, behind
              // the same permission gates — the card is the row on a smaller
              // screen, not a reduced one.
              onEdit={() => setEditing(o)}
              onVoidLabel={() => setVoidingLabelFor(o)}
              onArtwork={() => setArtworkFor(o)}
              onRecalc={() => void recalc([o.id])}
              recalcPending={recalcPending}
            />
          )}
          // Every order has a line to show, so the expander is on every row. The
          // panel fetches its own dates when it opens; nothing is loaded for the
          // twenty-four rows nobody expanded.
          renderExpanded={(o) => <OrderTimeline orderId={o.id} />}
          expandLabel={t("orders.timeline.toggle")}
          selected={selected}
          // Any hand-made change to the selection retracts the "all matching"
          // claim: unticking one row out of 5,312 leaves a selection that is
          // emphatically not all of them, and the strip must stop saying it is.
          onSelectedChange={(next) => {
            setSelected(next);
            setAllMatching(false);
            setSelectionCapped(false);
          }}
          empty={hasFilters ? t("orders.emptyFiltered") : t("orders.empty")}
          toolbar={
            <DataTableToolbar
              search={params.get("q")}
              onSearchChange={(v) => params.setFilter("q", v)}
              searchPlaceholder={t("orders.search")}
              hasFilters={hasFilters}
              onClearFilters={clearAllFilters}
              selectedCount={selected.size}
              /* THE FILTER TIER. Replaced by `bulkActions` while rows are
                 ticked — DataTableToolbar swaps the two — which is the right
                 way round: nobody narrows a list and acts on a selection in
                 the same breath. */
              filters={
                <>
                  <Select
                    value={status || "all"}
                    onValueChange={(v) => params.setFilter("status", v === "all" ? "" : String(v))}
                  >
                    <SelectTrigger className="w-44" aria-label={t("orders.colStatus")}>
                      <SelectValue>
                        {status ? t(`orders.statuses.${status}`) : t("orders.allStatuses")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("orders.allStatuses")}</SelectItem>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`orders.statuses.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* THE DATE WINDOW. The page has read `?from=`/`?to=` for the
                      summary cards since they were written, `listOrders` now
                      honours the same two, and this control has existed in
                      components/ds unused the whole time — so this is wiring,
                      not new machinery.

                      `YYYY-MM-DD` in both directions, and the two helpers are
                      the reason it round-trips: the picker works in local time
                      and `new Date("2026-09-07")` is UTC midnight, so parsing
                      the param with the plain constructor would show the 6th to
                      anyone west of Greenwich and walk the range one day back
                      on every open. The page bounds `to` at 23:59:59.999Z, so
                      the end of the range is INCLUSIVE — picking the same day
                      twice means that day, not an empty list. */}
                  <DateRangeField
                    from={from}
                    to={to}
                    label={t("orders.placedBetween")}
                    onChange={setDateRange}
                  />
                </>
              }
              /* THE SELECTION TIER — the three or four things an operator
                 actually does to a batch, led by DataTableToolbar's own
                 "N selected" so every button in it has a stated subject.
                 Everything rarer went to the overflow menu in `actions`. */
              bulkActions={
                canBulk ? (
                  <>
                    <OrderStatusActions
                      selected={selectedIds}
                      rows={rows}
                      onDone={clearSelection}
                    />
                    <Can permission="orders.status.update">
                      {/* A real route, opened in a new tab: the sheet prints
                          itself, and the operator keeps their place in the
                          table behind it. */}
                      <Button
                        variant="outline"
                        onClick={() =>
                          window.open(
                            `/orders/print?ids=${selectedIds.join(",")}`,
                            "_blank",
                            "noopener",
                          )
                        }
                      >
                        {t("orders.qr.print")} ({selectedIds.length})
                      </Button>
                    </Can>
                    <Can permission="orders.labels.manage">
                      <BuyLabelsButton orderIds={selectedIds} onDone={clearSelection} />
                    </Can>
                    <Can permission="orders.assign">
                      <Button variant="outline" onClick={() => setAssigning(true)}>
                        {t("orders.assign")} ({selectedIds.length})
                      </Button>
                    </Can>
                  </>
                ) : undefined
              }
              /* HOW THE LIST IS DRAWN, not what is in it — which is the whole
                 reason DataTableToolbar has a third slot. Both controls stay
                 visible while rows are selected, because bulk mode changes what
                 the buttons act on and not how the rows are read. */
              trailing={
                <>
                  <SavedViews />
                  {/*
                   * DENSITY. `params.density` already rides in the URL and the
                   * cells already answer `data-density`; this is the control
                   * that was missing.
                   *
                   * API_CLIENT.md §2 says "Full-density tables cap at 12
                   * rows/page regardless of the selection (both Orders
                   * screens)", and this deliberately does NOT nudge the page
                   * size to honour it. Three reasons, in order of weight:
                   * DataTablePagination offers [10, 25, 50, 100], so writing
                   * `?size=12` would put its Select into a state with no
                   * matching option; useTableParams goes out of its way NOT to
                   * reset `?page` on a density change precisely so the reader
                   * keeps their place, and silently re-paginating under them
                   * would throw away the row they were looking at; and that
                   * cap was written against a client whose own per-screen
                   * options are [25,50,100,200,500], none of which this app
                   * offers either. Row HEIGHT is what full density is for and
                   * that is honoured exactly; the row COUNT stays the reader's
                   * choice.
                   */}
                  <SegmentedControl
                    size="sm"
                    aria-label={t("common.table.density")}
                    value={params.density}
                    onChange={(v) => params.setDensity(v as TableDensity)}
                    options={[
                      { value: "compact", label: t("common.table.densityCompact") },
                      { value: "cozy", label: t("common.table.densityCozy") },
                      { value: "full", label: t("common.table.densityFull") },
                    ]}
                  />
                </>
              }
              /* THE PAGE TIER. These act on the PAGE, not on the selection, so
                 they belong here and stay put while rows are ticked — and there
                 are now three of them rather than the eleven that used to wrap
                 onto three lines and push the table below the fold.

                 The DS is explicit that PageHeader owns no CTA ("Operational
                 actions belong in TopNav.cta, SearchShell.action or
                 TabBar.right… a hero with a primary button in the corner is the
                 generic-SaaS page-header pattern, and this component
                 deliberately makes it unavailable"), and PageToolbar's own doc
                 says a page whose list renders DataTableToolbar does not need
                 one because "that toolbar is the same surface and the same
                 slot". So this IS the page's action slot; New order is its one
                 Action Blue button. */
              actions={
                <>
                  <OrderMoreActions
                    selectedIds={selectedIds}
                    onRecalc={() => void recalc(selectedIds)}
                    recalcPending={recalcPending}
                    onRefund={() => setRefunding(true)}
                    onDelete={() => setDeleting(true)}
                  />
                  <Can permission="orders.create">
                    <Button variant="outline" onClick={() => setImporting(true)}>
                      {t("orders.import")}
                    </Button>
                    <Button onClick={() => setCreating(true)}>{t("orders.new")}</Button>
                  </Can>
                </>
              }
            />
          }
          footer={
            <DataTablePagination
              page={params.page}
              pageSize={params.pageSize}
              total={total}
              onPageChange={params.setPage}
              onPageSizeChange={params.setPageSize}
              selectedCount={selected.size}
            />
          }
        />
      </div>

      {creating && <OrderDialog open onOpenChange={(o) => !o && setCreating(false)} />}
      {editing && (
        <OrderDialog
          order={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      {voidingLabelFor?.shipmentId && (
        <VoidLabelDialog
          shipmentId={voidingLabelFor.shipmentId}
          trackingNumber={voidingLabelFor.tracking}
          open
          onOpenChange={(o) => !o && setVoidingLabelFor(null)}
        />
      )}
      {importing && <ImportDialog open onOpenChange={(o) => !o && setImporting(false)} />}
      {assigning && (
        <AssignDialog
          orderIds={selectedIds}
          warehouses={warehouses}
          open
          onOpenChange={(o) => !o && setAssigning(false)}
          onDone={clearSelection}
        />
      )}
      {artworkFor && (
        <ArtworkDialog
          orderId={artworkFor.id}
          label={artworkFor.externalId ?? `#${artworkFor.id}`}
          designUrl={artworkFor.imageUrl}
          // The mockup's thumbnail IS its url for anything this dialog set —
          // setOrderArtwork writes the same string to both — and it is the
          // only mockup field the orders query selects.
          mockupUrl={artworkFor.mockupThumbnail}
          open
          onOpenChange={(o) => !o && setArtworkFor(null)}
        />
      )}
      {refunding && (
        <RefundDialog
          orderIds={selectedIds}
          open
          onOpenChange={(o) => !o && setRefunding(false)}
          onDone={clearSelection}
        />
      )}
      {deleting && (
        <DeleteOrdersDialog
          orderIds={selectedIds}
          open
          onOpenChange={(o) => !o && setDeleting(false)}
          onDone={clearSelection}
        />
      )}
    </>
  );
}
