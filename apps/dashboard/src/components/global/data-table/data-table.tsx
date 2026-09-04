"use client";

import { Fragment, useState, type ReactNode } from "react";
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
  mobileCard,
  renderExpanded,
  expandLabel,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const selectable = Boolean(selected && onSelectedChange);
  const expandable = Boolean(renderExpanded);
  const [openRow, setOpenRow] = useState<string | null>(null);

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

  const nextSortFor = (id: string): SortState => {
    // asc → desc → none, so a user can always get back to the default order.
    if (!sort || sort.id !== id) return { id, desc: false };
    if (!sort.desc) return { id, desc: true };
    return null;
  };

  const colSpan = columns.length + (selectable ? 1 : 0) + (expandable ? 1 : 0);

  if (mobileCard && isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {toolbar}
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
          <ul className="flex flex-col gap-2">
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
                        aria-label={t("common.table.selectRow")}
                        className="mt-1 shrink-0"
                      />
                    )}
                    <div
                      className="min-w-0 flex-1"
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
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
    <div className="flex flex-col gap-3">
      {toolbar}

      <div className="overflow-x-auto rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-data) shadow-(--shadow-xs)">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onCheckedChange={toggleAll}
                    aria-label={t("common.table.selectAll")}
                  />
                </TableHead>
              )}
              {expandable && <TableHead className="w-10" />}
              {columns.map((col) => {
                const isSorted = sort?.id === col.id;
                return (
                  <TableHead
                    key={col.id}
                    aria-sort={
                      isSorted ? (sort!.desc ? "descending" : "ascending") : undefined
                    }
                    className={cn(
                      col.className,
                      col.hideOnMobile && "hidden sm:table-cell",
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
                <TableRow key={`skeleton-${i}`}>
                  {selectable && (
                    <TableCell>
                      <Skeleton className="size-4" />
                    </TableCell>
                  )}
                  {expandable && (
                    <TableCell>
                      <Skeleton className="size-4" />
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(col.hideOnMobile && "hidden sm:table-cell")}
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
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        onRowClick && "cursor-pointer",
                        // The open row and its panel read as one object, so the
                        // row takes the panel's ground rather than the stripe.
                        isOpen && "bg-sky-50 hover:bg-sky-50",
                      )}
                    >
                      {selectable && (
                        <TableCell
                          // The checkbox must not trigger the row's own click.
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(id)}
                            aria-label={t("common.table.selectRow")}
                          />
                        </TableCell>
                      )}
                      {expandable && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                          className={cn(
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
