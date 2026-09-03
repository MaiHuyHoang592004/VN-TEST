/**
 * Search Dropdown Component
 * Displays search results with recent searches, orders and products
 * Isolates scroll behavior to prevent page scrolling
 */

"use client";

import { useRef, useLayoutEffect } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTranslation } from "@/lib/i18n";
import { SearchResultItem } from "./SearchResultItem";
import type { SearchResult, RecentSearch } from "./types";

interface SearchDropdownProps {
  anchor?: "left" | "right";
  searchQuery: string;
  results: SearchResult[];
  recentSearches: RecentSearch[];
  isLoading: boolean;
  isError: boolean;
  selectedIndex: number;
  onSelectItem: (item: SearchResult | RecentSearch) => void;
  product?: "dropdown" | "modal";
}

export function SearchDropdown({
  searchQuery,
  results,
  recentSearches,
  isLoading,
  isError,
  selectedIndex,
  onSelectItem,
  product = "dropdown",
  anchor = "right",
}: SearchDropdownProps) {
  const { t } = useTranslation();
  const showRecentSearches = false; // Recent searches disabled
  const showNoResults =
    searchQuery.length >= 1 && !isLoading && results.length === 0;
  const showResults = results.length > 0;
  const showSeparator = false; // No separator needed

  // Styling based on product — Vercel panel: popover tokens, blue-tinted glow, entrance animation
  const containerClass =
    product === "modal"
      ? "text-foreground bg-popover border-border shadow-ds-4 animate-in fade-in slide-in-from-top-2 absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-lg border duration-200"
      : `text-foreground bg-popover border-border shadow-ds-4 animate-in fade-in slide-in-from-top-2 absolute top-full z-50 mt-2 overflow-hidden rounded-lg border duration-200 ${anchor === "left" ? "left-0 w-full sm:w-96" : "right-0 w-full sm:w-96"}`;

  const listClass = product === "modal" ? "max-h-[400px]" : "max-h-[300px]";
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Globally prevent scrollIntoView from affecting page scroll
  // This runs synchronously before paint to catch all scroll attempts
  useLayoutEffect(() => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalScrollTo = window.scrollTo;
    const originalScroll = window.scroll;

    // Store the scroll position when dropdown opens
    const initialScrollY = window.scrollY;
    const initialScrollX = window.scrollX;

    // Override scrollIntoView completely while dropdown is open
    Element.prototype.scrollIntoView = function (
      _arg?: boolean | ScrollIntoViewOptions
    ) {
      // Only allow scroll for elements inside dropdown's list
      const list = dropdownRef.current?.querySelector(
        '[data-slot="command-list"]'
      );
      if (list?.contains(this as Node)) {
        // Use block: 'nearest' to minimize scroll
        originalScrollIntoView.call(this, {
          block: "nearest",
          inline: "nearest",
        });
        // Immediately restore page scroll if it changed
        if (
          window.scrollY !== initialScrollY ||
          window.scrollX !== initialScrollX
        ) {
          originalScrollTo.call(window, initialScrollX, initialScrollY);
        }
        return;
      }
      // Block all other scrollIntoView calls
    };

    // Prevent any window scroll changes while dropdown is open
    const preventWindowScroll = () => {
      if (
        window.scrollY !== initialScrollY ||
        window.scrollX !== initialScrollX
      ) {
        originalScrollTo.call(window, initialScrollX, initialScrollY);
      }
    };

    // Add scroll listener to catch and revert any scroll
    window.addEventListener("scroll", preventWindowScroll, { passive: false });

    return () => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      window.scrollTo = originalScrollTo;
      window.scroll = originalScroll;
      window.removeEventListener("scroll", preventWindowScroll);
    };
  }, []);

  return (
    <div
      ref={dropdownRef}
      className={containerClass}
      style={{
        overflowAnchor: "none",
        contain: "layout style paint",
        isolation: "isolate",
      }}
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <Command
        className="bg-popover border-0"
        shouldFilter={false}
        loop={false}
      >
        <CommandList
          className={listClass}
          style={{ overscrollBehavior: "contain" }}
        >
          {/* Recent Searches */}
          {showRecentSearches && (
            <CommandGroup heading={t("search.quickLinks")}>
              {recentSearches.map((item, index) => (
                <SearchResultItem
                  key={item.id}
                  item={item}
                  isSelected={selectedIndex === index}
                  isRecent
                  onSelect={() => onSelectItem(item)}
                  product={product}
                />
              ))}
            </CommandGroup>
          )}

          {/* No Results */}
          {showNoResults && (
            <CommandEmpty>
              {isError ? t("search.error") : t("search.noResults")}
            </CommandEmpty>
          )}

          {/* Order / Product Results */}
          {showResults && (
            <>
              {showSeparator && <CommandSeparator />}
              <CommandGroup heading={undefined}>
                {results.map((item, index) => (
                  <SearchResultItem
                    key={item.id}
                    item={item}
                    isSelected={selectedIndex === index}
                    onSelect={() => onSelectItem(item)}
                    product={product}
                  />
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
