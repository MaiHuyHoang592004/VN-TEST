"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

/**
 * Search + filters + bulk actions above a table.
 *
 * The search box is debounced and locally controlled: typing updates the input
 * immediately but only pushes to the URL once the user pauses, so a five-letter
 * query doesn't fire five server round-trips and five history entries.
 */
export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  actions,
  selectedCount = 0,
  bulkActions,
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

        {selectedCount > 0 && bulkActions ? bulkActions : filters}

        {hasFilters && onClearFilters && selectedCount === 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="size-4" />
            {t("common.table.clear")}
          </Button>
        )}
      </div>

      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
