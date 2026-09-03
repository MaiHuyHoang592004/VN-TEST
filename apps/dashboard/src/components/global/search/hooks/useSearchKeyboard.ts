/**
 * useSearchKeyboard Hook
 * Handles keyboard shortcuts (Cmd+K, F) and navigation for search component
 */

import { useEffect } from "react";

interface UseSearchKeyboardProps {
  product: "dropdown" | "modal";
  open: boolean;
  mobileExpanded: boolean;
  selectableItemsCount: number;
  selectedIndex: number;
  onClose: () => void;
  onMobileClose?: () => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onSelect: () => void;
  onFocus: () => void;
  searchRef: React.RefObject<HTMLDivElement | null>;
}

export function useSearchKeyboard({
  product,
  open,
  mobileExpanded,
  selectableItemsCount,
  selectedIndex,
  onClose,
  onMobileClose,
  onNavigateUp,
  onNavigateDown,
  onSelect,
  onFocus,
  searchRef,
}: UseSearchKeyboardProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open search
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onFocus();
        return;
      }

      // F key (when not typing in an input) to open search
      if (e.key === "f" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (
          target.tagName !== "INPUT" &&
          target.tagName !== "TEXTAREA" &&
          !target.isContentEditable
        ) {
          e.preventDefault();
          onFocus();
        }
        return;
      }

      // Arrow key navigation (only when dropdown is open and has items)
      if (open && selectableItemsCount > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onNavigateDown();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onNavigateUp();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          onSelect();
          return;
        }
      }

      // Close on Escape
      if (e.key === "Escape") {
        onClose();
        if (mobileExpanded && onMobileClose) {
          onMobileClose();
        }
      }
    };

    // Close dropdown when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [
    product,
    open,
    mobileExpanded,
    selectableItemsCount,
    selectedIndex,
    onClose,
    onMobileClose,
    onNavigateUp,
    onNavigateDown,
    onSelect,
    onFocus,
    searchRef,
  ]);
}
