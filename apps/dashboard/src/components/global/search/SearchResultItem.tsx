/**
 * Search Result Item Component
 * Individual search result item with highlighting for selected state.
 * Icon reflects the result kind: order, variant, or recent search.
 */

"use client";

import { ArrowRight, Clock, Package, ShoppingBag, User } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import type { SearchResult, RecentSearch } from "./types";

interface SearchResultItemProps {
  item: SearchResult | RecentSearch;
  isSelected: boolean;
  isRecent?: boolean;
  onSelect: () => void;
  variant?: "dropdown" | "modal";
}

export function SearchResultItem({
  item,
  isSelected,
  isRecent = false,
  onSelect,
  variant = "dropdown",
}: SearchResultItemProps) {
  // Four kinds now that search reads the real database: orders, catalogue
  // rows, people, and the app's own pages.
  const Icon = isRecent
    ? Clock
    : item.type === "order"
      ? Package
      : item.type === "user"
        ? User
        : item.type === "page"
          ? ArrowRight
          : ShoppingBag;

  // Modal variant layout (horizontal)
  if (variant === "modal") {
    return (
      <CommandItem
        onSelect={onSelect}
        className={`cursor-pointer rounded-(--radius-xs) data-highlighted:bg-sky-100 data-highlighted:text-navy-700 ${isSelected ? "bg-sky-100 text-navy-700" : ""}`}
      >
        <Icon className="mr-2 h-4 w-4 text-(--text-muted)" />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <span className="font-sans font-semibold">{item.name}</span>
            <span className="ml-2 font-mono text-(length:--fs-body-sm) tracking-(--ls-mono) text-(--text-muted)">
              {item.code}
            </span>
          </div>
          <span className="text-(length:--fs-micro) text-(--text-muted)">{item.category}</span>
        </div>
      </CommandItem>
    );
  }

  // Dropdown variant layout (vertical)
  return (
    <CommandItem
      onSelect={onSelect}
      className={`cursor-pointer rounded-(--radius-xs) data-highlighted:bg-sky-100 data-highlighted:text-navy-700 ${isSelected ? "bg-sky-100 text-navy-700" : ""}`}
    >
      <Icon className="mr-2 h-4 w-4 text-(--text-muted)" />
      <div className="flex flex-1 flex-col">
        <span className="font-sans text-(length:--fs-body-sm) font-semibold">{item.name}</span>
        <span className="text-(length:--fs-micro) text-(--text-muted)">
          <span className="font-mono tracking-(--ls-mono)">{item.code}</span> • {item.category}
        </span>
      </div>
    </CommandItem>
  );
}
