/**
 * Search Input Component
 * Handles the search input field with loading states and keyboard shortcuts
 * Uses preventScroll on focus to avoid page jumping
 */

"use client";

import { forwardRef, useCallback } from "react";
import { Search as SearchIcon } from "lucide-react";

interface SearchInputProps {
  fullWidth?: boolean;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  placeholder?: string;
  showLoading?: boolean;
  variant?: "dropdown" | "modal";
  mobileExpanded?: boolean;
  onMobileClose?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onFocus,
      placeholder = "Search…",
      showLoading = false,
      variant = "dropdown",
      mobileExpanded = false,
      onMobileClose,
      fullWidth = false,
    },
    ref
  ) => {
    // Handle focus without triggering scroll
    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        // Prevent any scroll behavior on focus
        e.preventDefault();
        onFocus();
      },
      [onFocus]
    );

    // Handle input change without scroll
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        // Store current scroll position
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        onChange(e.target.value);

        // Restore scroll position immediately
        requestAnimationFrame(() => {
          window.scrollTo(scrollX, scrollY);
        });
      },
      [onChange]
    );

    // Common input styles to prevent scroll
    const inputStyle = {
      scrollMargin: 0,
      scrollPadding: 0,
    };

    // Modal variant (landing page) — Vercel focus treatment: blue border + ring + soft glow
    if (variant === "modal") {
      return (
        <div className="border-border hover:border-foreground/30 focus-within:border-action-500/60 focus-within:ring-2 focus-within:ring-action-500/20 focus-within:shadow-lg focus-within:shadow-action-500/10 bg-background relative flex h-12 items-center gap-3 rounded-lg border px-4 transition-all sm:h-14 sm:px-6">
          <SearchIcon className="text-muted-foreground h-5 w-5 shrink-0" />
          <input
            ref={ref}
            type="text"
            placeholder={placeholder}
            className="text-foreground placeholder:text-muted-foreground flex-1 bg-transparent text-base outline-none"
            style={inputStyle}
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {showLoading && (
            <div className="text-muted-foreground h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
        </div>
      );
    }

    // Dropdown variant (navbar/sidebar) — the spec's two-layer focus ring, not
    // a blue glow: DESIGN-VERCEL.md appendix names ring-2 ring-ring offset-2
    // as THE focus treatment, and controls are rounded-sm at every size.
    return (
      <div
        className={`border-border hover:border-foreground/30 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background bg-background relative inline-flex items-center gap-2 rounded-sm border px-3 text-sm transition-all ${mobileExpanded ? "h-10 w-full" : fullWidth ? "h-9 w-full" : "h-9 w-full sm:w-72"}`}
      >
        <SearchIcon
          className={`text-muted-foreground shrink-0 ${mobileExpanded ? "h-5 w-5" : "h-4 w-4"}`}
        />
        <input
          ref={ref}
          type="text"
          placeholder={placeholder}
          className="text-foreground placeholder:text-muted-foreground m-0 w-full min-w-0 flex-1 bg-transparent outline-none placeholder:truncate"
          style={inputStyle}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {showLoading && (
          <div className="text-muted-foreground h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {mobileExpanded ? (
          <button
            onClick={() => {
              onChange("");
              onMobileClose?.();
            }}
            className="text-muted-foreground hover:text-foreground flex items-center justify-center"
            aria-label="Close search"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
            >
              <path
                d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <div className={`pointer-events-none items-center gap-1 select-none ${fullWidth ? "flex" : "hidden sm:flex"}`}>
            <kbd className="text-muted-foreground border-border inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center rounded-[4px] border bg-transparent px-1 font-sans text-xs font-medium">
              ⌘
            </kbd>
            <kbd className="text-muted-foreground border-border inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center rounded-[4px] border bg-transparent px-1 font-sans text-xs font-medium">
              K
            </kbd>
          </div>
        )}
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
