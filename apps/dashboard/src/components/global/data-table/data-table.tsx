"use client";

import {
  Fragment,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useIsMobile } from "@/hooks/use-mobile";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The table every list screen is built from — Users, Warehouses, Audit and the
 * ~20 pages of the legacy rebuild. Built once so they can't drift into twenty
 * slightly different tables.
 *
 * Server-driven by design: sorting, filtering and paging are URL state handled
 * by the page, not hidden client state. That keeps a filtered list linkable and
 * shareable, lets each page server-render exactly the rows it needs, and means
 * a 50k-row table never ships to the browser.
 *
 * Deliberately NOT a wrapper around a table library: what we need is row
 * definitions, selection and the three empty/loading/error states. A library
 * would add a dependency and a second mental model for less than it gives back.
 */

/**
 * Anything that is itself operable and therefore owns its own click.
 *
 * The desktop path guards the checkbox and expander cells with an explicit
 * stopPropagation, but a `mobileCard` is rendered by the page and can hold any
 * number of buttons and links, none of which can be reached from here to guard
 * individually. So the row asks the event instead: a click that started inside
 * something operable is that thing's click, not the row's.
 */
const INTERACTIVE_SELECTOR =
  'a[href],button,input,select,textarea,label,[role="button"],[role="link"],[role="checkbox"],[role="menuitem"],[contenteditable="true"]';

function isInteractiveTarget(e: ReactMouseEvent<HTMLElement>): boolean {
  if (!(e.target instanceof Element)) return false;
  const hit = e.target.closest(INTERACTIVE_SELECTOR);
  // The row wrapper itself may carry role="button"; it is the row, not a child.
  return hit !== null && hit !== e.currentTarget;
}

/**
 * The sentence and the one link inside the select-all strip.
 *
 * Shared by the table and the phone-card layout so the wording and the affordance
 * are decided in one place. Sky, not a new colour: the DS gives list screens one
 * sky element, and `--sky-50` is already what this table uses for a row that has
 * been opened, so a strip about the rows reads as part of the same object rather
 * than as an alert.
 *
 * IT CARRIES NO `role="status"` OF ITS OWN, and that is the fix rather than an
 * omission. It did, on the sound argument that a count only sighted users get
 * is a count half the users don't — but this node is MOUNTED together with its
 * text, and a polite live region inserted with its content in the same commit
 * is unreliably announced (silent on VoiceOver/Safari in particular). It cannot
 * simply stay mounted either: it is a `<tr>` on the desktop and a tile on the
 * phone, so an empty one would leave a phantom band above the rows. The
 * announcement therefore comes from a permanently-mounted `sr-only` region
 * hoisted out of the table (see `liveStrip` below) — the same shape
 * catalog-browser.tsx and notifications-list.tsx already use — and this node
 * stays purely visual so the sentence is not read out twice.
 */
function SelectAllStripBody({
  text,
  action,
  onAction,
  refocus = false,
}: {
  text: string;
  action: string;
  onAction?: () => void;
  /**
   * True when acting DESTROYS this button — i.e. "Clear selection", after
   * which the strip has nothing left to say and unmounts.
   *
   * React does not re-home focus off a node it removes, so it fell to
   * `<body>`: the ring vanished and a keyboard or screen-reader user lost
   * their place in a five-thousand-row list (WCAG 2.4.3). Focus moves first,
   * to the checkbox that governs the selection being cleared — the header's
   * select-all in the table layout, the first card's on a phone.
   */
  refocus?: boolean;
}) {
  return (
    // Pinned to the left edge of the scroll port: the strip is as wide as the
    // table, so on a table scrolled sideways an unpinned sentence walks off
    // screen at exactly the moment the header checkbox is out of reach too.
    <div className="sticky left-0 inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 font-sans text-(length:--fs-body-sm) text-(--text-body)">
      <span>{text}</span>
      {onAction && (
        <button
          type="button"
          onClick={(e) => {
            // Walked from the event rather than held in a ref: the two layouts
            // put this button in different trees, and `data-slot` is already
            // how every primitive here is found.
            if (refocus) {
              e.currentTarget
                .closest('[data-slot="data-table"]')
                ?.querySelector<HTMLElement>(
                  'thead [data-slot="checkbox"], [data-slot="data-table-rows"] [data-slot="checkbox"]',
                )
                ?.focus();
            }
            onAction?.();
          }}
          className="rounded-(--radius-xs) font-semibold text-(--text-link) underline underline-offset-2 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:text-(--text-link-hover) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
        >
          {action}
        </button>
      )}
    </div>
  );
}

export type Column<T> = {
  /** Stable key; also the sort key sent to the server when `sortable`. */
  id: string;
  header: ReactNode;
  /** Cell renderer. Kept explicit rather than magic key access so a cell can
   * combine fields (name + avatar) without a special case. */
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  /** Tailwind classes for both the header and its cells — alignment, width. */
  className?: string;
  /** Hidden below `sm`. Use for columns that aren't worth a horizontal scroll
   * on a phone. Ignored when the table renders as cards (see `mobileCard`). */
  hideOnMobile?: boolean;
};

export type SortState = { id: string; desc: boolean } | null;

/**
 * Row density — the design system's Gọn / Vừa / Đầy đủ switch.
 *
 * `cozy` is today's table and stays the default, so the three tables already
 * built on this component (Users, Warehouses, Audit) render byte-identically
 * without knowing the prop exists. `compact` is the scan-heavy setting the DS
 * asks for on the order workbench; `full` is the roomy one that gives a row
 * with a thumbnail and two lines of product text somewhere to breathe.
 */
export type TableDensity = "compact" | "cozy" | "full";

/**
 * Vertical padding per density. Horizontal padding is deliberately NOT part of
 * this: narrowing the gutters as well makes a compact table read as a wall of
 * text rather than a tighter one, and the column widths would shift under the
 * user every time they switched.
 *
 * `cozy` repeats `TableCell`'s own `py-4` rather than being an empty string —
 * an explicit value is what lets `cn()` resolve the conflict when a column
 * passes its own padding, instead of the two silently both applying.
 */
const DENSITY_CELL: Record<TableDensity, string> = {
  compact: "py-2",
  cozy: "py-4",
  full: "py-6",
};

export type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  /** Stable identity — used for React keys and selection. */
  rowId: (row: T) => string;

  loading?: boolean;
  /** Shown when there are no rows and we're not loading. */
  empty?: ReactNode;
  /** Shown instead of rows when a fetch failed. */
  error?: ReactNode;

  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  /** Omit both to disable selection entirely. */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;

  /** Rendered above the table — filters, search, bulk actions. */
  toolbar?: ReactNode;
  /** Rendered below — usually <DataTablePagination />. */
  footer?: ReactNode;

  onRowClick?: (row: T) => void;

  /**
   * A name for this row, used to build the selection checkbox's accessible
   * name. Without it fifty rows announce the same phrase fifty times, and a
   * screen-reader user has nothing tying a checkbox to the row it selects.
   * Falls back to the generic label when a page does not pass one.
   */
  rowLabel?: (row: T) => string;

  /**
   * Render each row as a CARD on phones instead of a table.
   *
   * A table on a 390px screen is a horizontal scroll with most of its columns
   * hidden, which is how the information a phone user needs ends up being the
   * information they cannot reach. A card shows the same row as a block, and
   * the app is going into a Capacitor shell where "phone" is the primary
   * surface rather than a fallback.
   *
   * Optional: a list without one keeps the (scrolling) table, so adopting this
   * is per-page rather than a flag day.
   */
  mobileCard?: (row: T) => ReactNode;

  /**
   * Extra detail for ONE row at a time, rendered in a full-width row beneath it.
   *
   * Returning null for a row means it has nothing to expand, and the affordance
   * is not drawn for it — an expander that opens an empty panel teaches people
   * to stop pressing expanders.
   *
   * One at a time on purpose: the panel is tall, and several open at once turns
   * the table into a list of panels with rows lost between them. Opening a
   * second closes the first.
   *
   * Omit to keep the table exactly as it was — no chevron column, no state.
   */
  renderExpanded?: (row: T) => ReactNode;
  /** Accessible name for the expander button. */
  expandLabel?: string;

  /**
   * Pin the header row while the page scrolls.
   *
   * `true` pins it at the top of the viewport; a string is a CSS length used as
   * the offset, and should almost always be the variable the chrome publishes
   * rather than a literal — `stickyHeader="var(--nav-height)"` keeps the header
   * glued to the real bottom edge of the top nav even if that nav changes
   * height. Off by default, so no existing table moves.
   *
   * Why it matters here rather than being a nicety: column meaning in an
   * operational table is POSITIONAL (RESPONSIVE.md / DOMAIN_RESOLVED.md §2 —
   * which is also why we never reflow one into cards). Once the header has
   * scrolled away, the fourth column is just a number.
   *
   * The catch, and it is a real one: `position: sticky` resolves against the
   * nearest SCROLLING ancestor, and both this component's card and `ui/table`'s
   * own container are `overflow-x-auto` — which computes `overflow-y` to `auto`
   * as well and so captures the sticky position in a box that never scrolls
   * vertically. There is no CSS that gives a viewport-pinned header inside a
   * horizontally-scrolling wrapper without also bounding the wrapper's height.
   * So, exactly as the DS's own `DataTable.d.ts` resolves it, turning this on
   * switches both wrappers to `overflow: visible` and a too-wide table scrolls
   * at PAGE level instead. The header survives that horizontal scroll — sticky
   * constrains only the block axis, so the pinned row slides sideways in
   * lockstep with the cells beneath it and never falls out of alignment.
   */
  stickyHeader?: boolean | string;

  /**
   * Row density. `cozy` (the default) is today's rendering exactly.
   *
   * Two things happen: the row padding changes here, and the chosen value is
   * published as `data-density` on the component's root, which also carries the
   * Tailwind group name `data-table`. That second half is the point — a page
   * owns its own cells, so it is the page that must shrink the artwork thumbnail
   * when the table goes compact, and it does that with
   * `group-data-[density=compact]/data-table:size-8` on the cell's own markup.
   * No prop-drilling, no context, and a cell that ignores density simply keeps
   * its size.
   */
  density?: TableDensity;

  /**
   * The "…and the other 387" half of select-all.
   *
   * `toggleAll` only ever touches the current page, which is the correct and
   * deliberate behaviour — but on its own it leaves the user who wants every
   * matching row with no way to say so. These four props are the second half:
   * when the page is fully selected and `matchCount` says the filter matches
   * more, a strip above the rows offers the wider selection, and once taken it
   * offers the way back out.
   *
   * DataTable stays presentational. It cannot enumerate ids it was never
   * handed, so it does not try: the page owns the count, owns what "all
   * matching" means for its query, and owns the resulting selection. All four
   * are optional and the strip simply never renders without them.
   */
  matchCount?: number;
  /** True once the page has acted on the offer — flips the strip to its
   * "N selected · Clear selection" state. */
  allMatchingSelected?: boolean;
  /**
   * True when the taken selection is only the FIRST slice of `matchCount` —
   * the page's enumeration hit its own ceiling.
   *
   * Without it the strip said "All 5,312 matching rows are selected" over a
   * two-thousand-id selection, in a `role="status"` region, directly above
   * Refund and Delete. The page cannot fix that by lying about `matchCount`
   * either: the offer that produced the selection has to keep quoting the real
   * total. So it says both numbers instead.
   */
  selectionCapped?: boolean;
  onSelectAllMatching?: () => void;
  onClearSelection?: () => void;
};

export function DataTable<T>({
  rows,
  columns,
  rowId,
  loading = false,
  empty,
  error,
  sort = null,
  onSortChange,
  selected,
  onSelectedChange,
  toolbar,
  footer,
  onRowClick,
  rowLabel,
  mobileCard,
  renderExpanded,
  expandLabel,
  stickyHeader = false,
  density = "cozy",
  matchCount,
  allMatchingSelected = false,
  selectionCapped = false,
  onSelectAllMatching,
  onClearSelection,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const selectable = Boolean(selected && onSelectedChange);
  const expandable = Boolean(renderExpanded);
  const [openRow, setOpenRow] = useState<string | null>(null);

  // `true` means "the top of the viewport"; anything else is the caller's own
  // CSS length. Kept as an inline style rather than a class because the offset
  // is a value the caller supplies, and Tailwind cannot compile a class it has
  // never seen.
  const stickyTop =
    stickyHeader === true ? "0px" : stickyHeader === false ? undefined : stickyHeader;
  const densityCell = DENSITY_CELL[density];

  /**
   * Applied to every `<th>` rather than to the `<tr>` or the `<thead>`: those
   * two are not layout boxes a browser will make sticky, so a header row is
   * pinned one cell at a time.
   *
   * `z-20` sits above the rows and comfortably below every layer the app
   * already owns — the top nav is `z-50`, drawers and dialogs above that, and
   * the DS budgets nav at 20 / drawers at 60. A header that outranks the nav it
   * is pinned under is the one failure mode worth spending a comment on.
   *
   * IT IS 20 AND NOT 10 BECAUSE A ROW CELL MAY BE POSITIONED TOO. A page can
   * pin a column (orders-table.tsx freezes its action rail with `sticky right-0
   * z-10`), and two positioned boxes at the same rank in the same stacking
   * context are painted in tree order — `<tbody>` after `<thead>` — so every
   * row's pinned cell slid OVER the header it was supposed to disappear
   * beneath, opaque fill, live buttons and all. Ranking the header above the
   * rail is the whole fix; nothing else needs to know about it.
   *
   * It is also applied AFTER `col.className` in the header cell below, which is
   * not cosmetic: `cn` is tailwind-merge, so the LAST of two conflicting
   * `z-*` classes wins, and putting the header class first would have left the
   * corner cell — the one that takes both — back at the rail's rank.
   *
   * The opaque `--surface-data` fill is not decoration: the header inherits the
   * card's white only by sitting on it, and a sticky element with a transparent
   * background has rows sliding through the column names.
   */
  const stickyHeadClass = stickyTop
    ? "sticky z-20 bg-(--surface-data)"
    : undefined;
  const stickyHeadStyle = stickyTop ? { top: stickyTop } : undefined;

  const allOnPageSelected =
    selectable && rows.length > 0 && rows.every((r) => selected!.has(rowId(r)));
  const someOnPageSelected =
    selectable && rows.some((r) => selected!.has(rowId(r))) && !allOnPageSelected;

  const toggleAll = () => {
    if (!selectable) return;
    const next = new Set(selected!);
    // Only ever touches the CURRENT page, so a selection made across pages
    // isn't silently wiped by toggling the header checkbox.
    if (allOnPageSelected) rows.forEach((r) => next.delete(rowId(r)));
    else rows.forEach((r) => next.add(rowId(r)));
    onSelectedChange!(next);
  };

  const toggleOne = (id: string) => {
    if (!selectable) return;
    const next = new Set(selected!);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange!(next);
  };

  const selectLabel = (row: T) => {
    const generic = t("common.table.selectRow");
    const name = rowLabel?.(row);
    return name ? `${generic}: ${name}` : generic;
  };

  // A clickable row must be operable without a mouse. Enter/Space only when the
  // row itself holds focus — a key pressed inside a control in the row belongs
  // to that control.
  const rowKeyDown = (row: T) => (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!onRowClick) return;
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onRowClick(row);
  };

  const rowClick = (row: T) => (e: ReactMouseEvent<HTMLElement>) => {
    if (!onRowClick) return;
    if (isInteractiveTarget(e)) return;
    onRowClick(row);
  };

  const nextSortFor = (id: string): SortState => {
    // asc → desc → none, so a user can always get back to the default order.
    if (!sort || sort.id !== id) return { id, desc: false };
    if (!sort.desc) return { id, desc: true };
    return null;
  };

  const colSpan = columns.length + (selectable ? 1 : 0) + (expandable ? 1 : 0);

  /**
   * What the select-all strip should say, or null for "don't draw it".
   *
   * Resolved once, here, so the table and the phone-card layouts cannot drift
   * into offering different things. The order matters: once the wider selection
   * has been taken, the only useful offer is the way back out — re-offering
   * "select all matching" to someone who already has it is noise.
   *
   * Guarded on rows being present and settled: a strip about a selection makes
   * no sense over skeletons, an error, or an empty result.
   */
  const selectAllStrip: {
    text: string;
    action: string;
    onAction?: () => void;
    refocus?: boolean;
  } | null =
    !selectable || loading || error || rows.length === 0
      ? null
      : allMatchingSelected
        ? {
            // Two sentences, because a capped selection is a different claim.
            // "All 5,312 matching rows are selected" over 2,000 ids is a false
            // statement in a live region immediately above Refund and Delete;
            // the honest version names both figures, exactly as the service's
            // own `capped` flag was added to let a caller do.
            text: selectionCapped
              ? t("common.table.allMatchingSelectedCapped", {
                  count: selected!.size,
                  total: matchCount ?? selected!.size,
                })
              : t("common.table.allMatchingSelected", {
                  count: matchCount ?? selected!.size,
                }),
            action: t("common.table.clearSelection"),
            onAction: onClearSelection,
            // Clearing the selection unmounts this strip along with the button
            // that was just activated — see `refocus` on SelectAllStripBody.
            refocus: true,
          }
        : allOnPageSelected &&
            typeof matchCount === "number" &&
            matchCount > rows.length &&
            onSelectAllMatching
          ? {
              text: t("common.table.pageSelected", { count: rows.length }),
              action: t("common.table.selectAllMatching", { count: matchCount }),
              onAction: onSelectAllMatching,
            }
          : null;

  /**
   * The strip's sentence for anyone who cannot see it.
   *
   * Mounted unconditionally and EMPTY until there is something to say, because
   * that is the difference between a live region that announces and one that
   * does not: screen readers reliably speak a change of text inside a region
   * they were already watching, and much less reliably a region that appears
   * with its text already in it — which is precisely the transition that
   * matters here, since the strip IS how the wider selection is discovered.
   * The visible strip is a table row and a phone tile, so it cannot stay
   * mounted itself; this can.
   */
  const liveStrip = (
    <div role="status" className="sr-only">
      {selectAllStrip ? `${selectAllStrip.text} ${selectAllStrip.action}` : ""}
    </div>
  );

  if (mobileCard && isMobile) {
    return (
      <div
        data-slot="data-table"
        data-density={density}
        className="group/data-table flex flex-col gap-3"
      >
        {toolbar}
        {liveStrip}

        {/* On phones the strip is its own tile above the list — there is no
            table to span, and the cards already read as a stack of blocks. */}
        {selectAllStrip && (
          <div className="rounded-(--radius-card) bg-sky-50 px-3 py-2">
            <SelectAllStripBody {...selectAllStrip} />
          </div>
        )}

        {error ? (
          <p className="py-10 text-center font-sans text-(length:--fs-body) text-(--status-critical-fg)">{error}</p>
        ) : loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={`card-skeleton-${i}`} className="h-28 w-full rounded-(--radius-card)" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center font-sans text-(length:--fs-body) text-(--text-muted)">{empty}</p>
        ) : (
          <ul data-slot="data-table-rows" className="flex flex-col gap-2">
            {rows.map((row) => {
              const id = rowId(row);
              return (
                <li
                  key={id}
                  className={cn(
                    "rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-data) p-3 transition-colors duration-(--dur-fast) motion-reduce:transition-none",
                    selectable && selected!.has(id) && "border-(--action-200) bg-sky-50",
                  )}
                >
                  <div className="flex gap-3">
                    {selectable && (
                      <Checkbox
                        checked={selected!.has(id)}
                        onCheckedChange={() => toggleOne(id)}
                        aria-label={selectLabel(row)}
                        className="mt-1 shrink-0"
                      />
                    )}
                    <div
                      className={cn(
                        "min-w-0 flex-1",
                        onRowClick &&
                          "cursor-pointer rounded-(--radius-xs) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none",
                      )}
                      role={onRowClick ? "button" : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      onClick={onRowClick ? rowClick(row) : undefined}
                      onKeyDown={onRowClick ? rowKeyDown(row) : undefined}
                    >
                      {mobileCard(row)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {footer}
      </div>
    );
  }

  return (
    <div
      data-slot="data-table"
      data-density={density}
      className="group/data-table flex flex-col gap-3"
    >
      {toolbar}
      {liveStrip}

      <div
        className={cn(
          "rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-data) shadow-(--shadow-xs)",
          // Without a pinned header the wide-table behaviour is what it always
          // was: scroll sideways inside the card, per RESPONSIVE.md. WITH one,
          // both this box and `ui/table`'s own container have to stop being
          // scroll containers or they capture the sticky position (see the
          // `stickyHeader` prop comment), so the overflow moves to the page.
          //
          // `w-max min-w-full` is the other half of that move, and it is not a
          // nicety. This box is the white ground: it stretches to its parent,
          // and the parent is <Page>'s 1120px band whatever the monitor is
          // doing. Once the table stopped being clipped by it, ~600px of rows
          // painted straight onto the sky canvas with the card's border and
          // rounded corner slicing vertically through them. Sizing the card to
          // its CONTENT instead keeps the surface under the rows it belongs to,
          // while `min-w-full` keeps a narrow table filling the band as before.
          stickyTop
            ? "w-max min-w-full overflow-x-visible [&_[data-slot=table-container]]:overflow-x-visible"
            : "overflow-x-auto",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead
                  style={stickyHeadStyle}
                  className={cn("w-10", stickyHeadClass)}
                >
                  <Checkbox
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onCheckedChange={toggleAll}
                    aria-label={t("common.table.selectAll")}
                  />
                </TableHead>
              )}
              {expandable && (
                <TableHead style={stickyHeadStyle} className={cn("w-10", stickyHeadClass)} />
              )}
              {columns.map((col) => {
                const isSorted = sort?.id === col.id;
                return (
                  <TableHead
                    key={col.id}
                    aria-sort={
                      isSorted ? (sort!.desc ? "descending" : "ascending") : undefined
                    }
                    style={stickyHeadStyle}
                    className={cn(
                      col.className,
                      col.hideOnMobile && "hidden sm:table-cell",
                      // LAST on purpose — see stickyHeadClass. A pinned column
                      // brings its own `z-10`, and tailwind-merge keeps the
                      // later of two z-indexes.
                      stickyHeadClass,
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(nextSortFor(col.id))}
                        className="-mx-1 inline-flex items-center gap-1 rounded-(--radius-xs) px-1 text-(--text-label) transition-colors duration-(--dur-fast) hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
                      >
                        {col.header}
                        {isSorted ? (
                          sort!.desc ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronUp className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {/* A row spanning the table rather than a strip above it, so the
                offer sits inside the same rules as the rows it is talking
                about and is as wide as they are. It is rendered before the
                error/loading/empty chain because `selectAllStrip` is already
                null in all three of those states. */}
            {selectAllStrip && (
              <TableRow className="bg-sky-50 hover:bg-sky-50">
                <TableCell colSpan={colSpan} className="px-3 py-2 whitespace-normal">
                  <SelectAllStripBody {...selectAllStrip} />
                </TableCell>
              </TableRow>
            )}

            {/* Error beats loading beats empty: showing skeletons after a failed
                fetch reads as "still working" and hides the problem. */}
            {error ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center">
                  {error}
                </TableCell>
              </TableRow>
            ) : loading ? (
              Array.from({ length: 5 }, (_, i) => (
                // The skeleton carries the density too, so the rows that land
                // are the height of the rows that were promised.
                <TableRow key={`skeleton-${i}`}>
                  {selectable && (
                    <TableCell className={densityCell}>
                      <Skeleton className="size-4" />
                    </TableCell>
                  )}
                  {expandable && (
                    <TableCell className={densityCell}>
                      <Skeleton className="size-4" />
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(
                        densityCell,
                        col.hideOnMobile && "hidden sm:table-cell",
                      )}
                    >
                      <Skeleton className="h-4 w-full max-w-[12rem]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="py-10 text-center font-sans text-(length:--fs-body) text-(--text-muted)"
                >
                  {empty ?? "Nothing to show."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const id = rowId(row);
                const isSelected = selectable && selected!.has(id);
                // Asked once per row: a row with nothing to show gets no
                // expander, and the panel below is only built when it is open.
                const panel = renderExpanded?.(row) ?? null;
                const isOpen = expandable && openRow === id;
                return (
                  <Fragment key={id}>
                    <TableRow
                      data-state={isSelected ? "selected" : undefined}
                      onClick={onRowClick ? rowClick(row) : undefined}
                      onKeyDown={onRowClick ? rowKeyDown(row) : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      className={cn(
                        onRowClick &&
                          "cursor-pointer focus-visible:shadow-(--shadow-focus) focus-visible:outline-none",
                        // The open row and its panel read as one object, so the
                        // row takes the panel's ground rather than the stripe.
                        isOpen && "bg-sky-50 hover:bg-sky-50",
                      )}
                    >
                      {selectable && (
                        <TableCell
                          className={densityCell}
                          // The checkbox must not trigger the row's own click.
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(id)}
                            aria-label={selectLabel(row)}
                          />
                        </TableCell>
                      )}
                      {expandable && (
                        <TableCell
                          className={densityCell}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {panel && (
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={expandLabel ?? t("common.table.toggleDetails")}
                              onClick={() => setOpenRow(isOpen ? null : id)}
                              className="inline-flex size-7 items-center justify-center rounded-(--radius-xs) text-(--icon-muted) transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
                            >
                              <ChevronDown
                                className={cn(
                                  "size-4 transition-transform duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none",
                                  isOpen && "rotate-180",
                                )}
                              />
                            </button>
                          )}
                        </TableCell>
                      )}
                      {columns.map((col) => (
                        <TableCell
                          key={col.id}
                          // Density first so a column that sets its own padding
                          // still wins — `cn` resolves the conflict in favour of
                          // the later class.
                          className={cn(
                            densityCell,
                            col.className,
                            col.hideOnMobile && "hidden sm:table-cell",
                          )}
                        >
                          {col.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>

                    {isOpen && panel && (
                      <TableRow className="bg-sky-50 hover:bg-sky-50">
                        <TableCell colSpan={colSpan} className="px-4 pt-0 pb-5">
                          {panel}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {footer}
    </div>
  );
}
