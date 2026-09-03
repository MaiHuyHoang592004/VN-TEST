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
        <div className="relative flex h-12 items-center gap-3 rounded-(--radius-card) border border-(--border-soft) bg-(--surface-inset) px-4 transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) hover:border-(--border-strong) focus-within:border-(--border-focus) focus-within:shadow-(--shadow-focus) motion-reduce:transition-none sm:h-14 sm:px-6">
          <SearchIcon className="h-5 w-5 shrink-0 text-(--text-muted)" />
          <input
            ref={ref}
            type="text"
            placeholder={placeholder}
            className="flex-1 bg-transparent font-sans text-(length:--fs-body-lg) text-(--text-body) outline-none placeholder:text-(--text-muted)"
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
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent text-(--text-muted)" />
          )}
        </div>
      );
    }

    // Dropdown variant (navbar/sidebar) — the spec's two-layer focus ring, not
    // a blue glow: DESIGN-VERCEL.md appendix names ring-2 ring-ring offset-2
    // as THE focus treatment, and controls are rounded-sm at every size.
    return (
      <div
        className={`relative inline-flex items-center gap-2 rounded-(--radius-control) border border-(--border-soft) bg-(--surface-inset) px-3 font-sans text-(length:--fs-body) transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) hover:border-(--border-strong) focus-within:border-(--border-focus) focus-within:shadow-(--shadow-focus) motion-reduce:transition-none ${mobileExpanded ? "h-(--control-height) w-full" : fullWidth ? "h-(--control-height) w-full" : "h-(--control-height) w-full sm:w-72"}`}
      >
        <SearchIcon
          className={`shrink-0 text-(--text-muted) ${mobileExpanded ? "h-5 w-5" : "h-4 w-4"}`}
        />
        <input
          ref={ref}
          type="text"
          placeholder={placeholder}
          className="m-0 w-full min-w-0 flex-1 bg-transparent text-(--text-body) outline-none placeholder:truncate placeholder:text-(--text-muted)"
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
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent text-(--text-muted)" />
        )}
        {mobileExpanded ? (
          <button
            onClick={() => {
              onChange("");
              onMobileClose?.();
            }}
            className="flex items-center justify-center text-(--text-muted) transition-colors duration-(--dur-fast) hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
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
            <kbd className="inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center rounded-(--radius-xs) border border-(--border-soft) bg-transparent px-1 font-sans text-(length:--fs-micro) font-semibold text-(--text-muted)">
              ⌘
            </kbd>
            <kbd className="inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center rounded-(--radius-xs) border border-(--border-soft) bg-transparent px-1 font-sans text-(length:--fs-micro) font-semibold text-(--text-muted)">
              K
            </kbd>
          </div>
        )}
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
