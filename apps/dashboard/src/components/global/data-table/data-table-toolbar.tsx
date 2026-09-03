"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ds";

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
  searchPlaceholder = "Search…",
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

  // Debounce: typing five letters shouldn't mean five server round-trips and
  // five history entries. The callback fires from a timer, never synchronously
  // during the effect.
  useEffect(() => {
    if (!onSearchChange || draft === (search ?? "")) return;
    const id = setTimeout(() => onSearchChange(draft), 300);
    return () => clearTimeout(id);
  }, [draft, search, onSearchChange]);

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
            placeholder={searchPlaceholder}
            className="w-full sm:max-w-xs"
          />
        )}

        {selectedCount > 0 && bulkActions ? bulkActions : filters}

        {hasFilters && onClearFilters && selectedCount === 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
