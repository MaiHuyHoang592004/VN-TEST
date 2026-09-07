"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Search + filters + bulk actions above a table.
 *
 * The search box is debounced and locally controlled: typing updates the input
 * immediately but only pushes to the URL once the user pauses, so a five-letter
 * query doesn't fire five server round-trips and five history entries.
 *
 * Three slots, and the difference between them is where a control BELONGS
 * rather than where it happens to fit: `filters` narrow the list, `actions` are
 * the page's own primary buttons on the right, and `trailing` is for controls
 * that change how the same list is DRAWN — a density switch, a grid/table
 * toggle. The DS is explicit that the segmented control "sits inline in a
 * toolbar next to search and filters, not as its own row", which is why there
 * is a third slot at all instead of a second toolbar.
 */
export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  actions,
  selectedCount = 0,
  bulkActions,
  trailing,
  onClearFilters,
  hasFilters = false,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Selects/date-pickers rendered next to the search box. */
  filters?: ReactNode;
  /** Right-aligned primary actions ("Invite user"). */
  actions?: ReactNode;
  selectedCount?: number;
  /** Replaces filters while rows are selected. */
  bulkActions?: ReactNode;
  /**
   * View controls — density, grid/table — pushed to the end of the FILTER row,
   * not grouped with `actions`. They belong with the things that shape the
   * list, and keeping them out of `actions` stops a quiet view toggle from
   * sitting next to the one primary button the region is allowed.
   *
   * Stays put while rows are selected: bulk mode changes what the buttons act
   * on, not how the rows are drawn.
   */
  trailing?: ReactNode;
  onClearFilters?: () => void;
  hasFilters?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(search ?? "");
  const [lastSearch, setLastSearch] = useState(search ?? "");

  // Re-sync when the URL changes from elsewhere (back button, Clear). Adjusted
  // DURING render rather than in an effect — React's documented pattern for
  // "state derived from a prop". An effect would render once with the stale
  // value first, and trips react-hooks/set-state-in-effect besides.
  if ((search ?? "") !== lastSearch) {
    setLastSearch(search ?? "");
    setDraft(search ?? "");
  }

  // Every caller passes an inline arrow, so `onSearchChange` is a new function
  // on every parent render. Held in a ref and kept out of the effect's deps: as
  // a dependency it restarted the 300ms timer on each of those renders, and a
  // parent that re-renders faster than the debounce delayed the search forever.
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  });

  // Debounce: typing five letters shouldn't mean five server round-trips and
  // five history entries. The callback fires from a timer, never synchronously
  // during the effect.
  useEffect(() => {
    if (draft === (search ?? "")) return;
    const id = setTimeout(() => onSearchChangeRef.current?.(draft), 300);
    return () => clearTimeout(id);
  }, [draft, search]);

  return (
    <div
      data-slot="data-table-toolbar"
      className="flex flex-col gap-3 rounded-(--radius-card) bg-(--surface-shell) p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {onSearchChange && (
          <SearchField
            value={draft}
            onChange={setDraft}
            placeholder={searchPlaceholder ?? t("common.table.search")}
            className="w-full sm:max-w-xs"
          />
        )}

        {/* Bulk actions REPLACE the filters, and they are led by the count so
            the buttons have a stated subject. "Archive" next to nothing is a
            question ("archive what?"); "12 selected · Archive" is a sentence.
            The whole phrase is one translated string with a {count} placeholder
            rather than a figure concatenated onto a word, so the locales that
            put the number last keep it last.

            THE COUNT'S LIVE REGION IS ALWAYS MOUNTED, empty until there is a
            selection. A polite region that enters the DOM already carrying its
            text is announced unreliably — and the first tick of the header
            checkbox is precisely the announcement that matters. `sr-only` when
            empty rather than absent: it is a flex item, and an empty one would
            otherwise spend a `gap-2` between the search box and the filters
            (position:absolute takes it out of flow entirely). */}
        <span
          role="status"
          className={cn(
            "font-sans text-(length:--fs-body-sm) font-semibold tabular-nums text-(--text-body)",
            !(selectedCount > 0 && bulkActions) && "sr-only",
          )}
        >
          {selectedCount > 0 && bulkActions
            ? t("common.table.selectedCount", { count: selectedCount })
            : ""}
        </span>
        {selectedCount > 0 && bulkActions ? bulkActions : filters}

        {hasFilters && onClearFilters && selectedCount === 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="size-4" />
            {t("common.table.clear")}
          </Button>
        )}

        {/* `ms-auto` parks it at the end of its own flex line, so it reads as
            the right-hand end of the filter row rather than as one more filter
            — and when the row wraps on a narrow screen it simply flows. */}
        {trailing && <div className="ms-auto flex items-center gap-2">{trailing}</div>}
      </div>

      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
