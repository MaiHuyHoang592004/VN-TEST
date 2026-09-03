/**
 * Search Component
 * Main search orchestrator with keyboard shortcuts and state management
 * Supports two variants: "dropdown" (navbar) and "modal" (landing page)
 *
 * Uses HYBRID search approach (best of both worlds):
 * 1. Initially: Server-side search (instant start, no waiting)
 * 2. Background: Downloads the full search index silently
 * 3. After load: Client-side search (instant filtering, ~5ms)
 * 4. Cache: Client data cached for 1 hour
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { useHybridSearch } from "./hooks/useHybridSearch";
import { useLocaleRouter } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { SearchInput } from "./SearchInput";
import { SearchDropdown } from "./SearchDropdown";
import { useSearchKeyboard } from "./hooks/useSearchKeyboard";
import type { SearchProps, RecentSearch, SearchResult } from "./types";

/** Where a result navigates: orders and products detail pages */
/** The server decides where a hit goes. The fallback covers rows stored in
 * "recent searches" before href existed — /orders/:id was never a real route,
 * which is how the demo search navigated into 404s. */
function resultHref(item: SearchResult | RecentSearch): string {
  return item.href || "/orders";
}

export function Search({
  variant = "dropdown",
  mobileExpanded = false,
  onMobileClose,
  fullWidth = false,
  anchor = "right",
}: SearchProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useLocaleRouter();
  const { t } = useTranslation();

  // Recent searches from localStorage
  const [recentSearches, setRecentSearches] = useLocalStorage<RecentSearch[]>(
    "recentSearches",
    []
  );

  // Hybrid search: server-side first, then client-side after background load
  // Debounced server search, scoped to what the viewer may see (doc 07 D2).
  const { results, isLoading, isError } = useHybridSearch(searchQuery, {
    // Matches the server's MIN_QUERY_LENGTH: one character would scan every
    // table to return five arbitrary rows, so neither side asks for it.
    minLength: 2,
    limit: 10,
    debounceMs: 200,
  });

  const showLoading = isLoading;

  // Get all selectable items
  const selectableItems = searchQuery.length < 1 ? recentSearches : results;

  // Clamp selected index to valid range
  const maxIndex = Math.max(0, selectableItems.length - 1);
  const clampedSelectedIndex = Math.min(selectedIndex, maxIndex);

  // Add item to recent searches
  const addToRecentSearches = useCallback(
    (item: SearchResult | RecentSearch) => {
      setRecentSearches((prev) => {
        const newSearch: RecentSearch = {
          id: item.id,
          code: item.code,
          name: item.name,
          type: item.type,
          category: item.category,
          href: item.href,
          timestamp: Date.now(),
        };

        const filtered = prev.filter((s) => s.id !== item.id);
        return [newSearch, ...filtered].slice(0, 5);
      });
    },
    [setRecentSearches]
  );

  // Handle result selection
  const handleSelectItem = useCallback(
    (item: SearchResult | RecentSearch) => {
      addToRecentSearches(item);
      setOpen(false);
      setSearchQuery("");
      inputRef.current?.blur();

      if (mobileExpanded && onMobileClose) {
        onMobileClose();
      }

      router.push(resultHref(item));
    },
    [addToRecentSearches, mobileExpanded, onMobileClose, router]
  );

  // Navigation handlers
  const handleNavigateDown = useCallback(() => {
    setSelectedIndex((prev) =>
      prev < selectableItems.length - 1 ? prev + 1 : prev
    );
  }, [selectableItems.length]);

  const handleNavigateUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
  }, []);

  const handleSelectCurrent = useCallback(() => {
    const selected = selectableItems[clampedSelectedIndex];
    if (selected) {
      handleSelectItem(selected);
    }
  }, [selectableItems, clampedSelectedIndex, handleSelectItem]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
    inputRef.current?.blur();
  }, []);

  // Handle focus from keyboard shortcuts (Cmd+K, F key)
  const handleFocus = useCallback(() => {
    if (variant === "dropdown") {
      inputRef.current?.focus({ preventScroll: true });
    } else {
      setOpen((prev) => !prev);
    }
  }, [variant]);

  // Keyboard shortcuts and navigation (Cmd+K, F, arrows, enter, escape)
  useSearchKeyboard({
    variant,
    open,
    mobileExpanded,
    selectableItemsCount: selectableItems.length,
    selectedIndex: clampedSelectedIndex,
    onClose: handleClose,
    onMobileClose,
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onSelect: handleSelectCurrent,
    onFocus: handleFocus,
    searchRef,
  });

  // Only show dropdown when user has typed something
  const shouldShowDropdown = open && searchQuery.length >= 1;

  return (
    <div
      ref={searchRef}
      className="relative w-full"
      style={{ overflowAnchor: "none" }}
    >
      <SearchInput
        ref={inputRef}
        fullWidth={fullWidth}
        value={searchQuery}
        onChange={setSearchQuery}
        onFocus={() => {
          setOpen(true);
        }}
        placeholder={t(fullWidth ? "search.placeholderShort" : "search.placeholder")}
        showLoading={showLoading}
        variant={variant}
        mobileExpanded={mobileExpanded}
        onMobileClose={onMobileClose}
      />

      {shouldShowDropdown && (
        <SearchDropdown
          searchQuery={searchQuery}
          results={results}
          recentSearches={recentSearches}
          isLoading={showLoading}
          isError={isError}
          selectedIndex={clampedSelectedIndex}
          onSelectItem={handleSelectItem}
          variant={variant}
          anchor={anchor}
        />
      )}
    </div>
  );
}
