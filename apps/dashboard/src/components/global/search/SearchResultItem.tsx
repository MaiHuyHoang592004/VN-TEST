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
  product?: "dropdown" | "modal";
}

export function SearchResultItem({
  item,
  isSelected,
  isRecent = false,
  onSelect,
  product = "dropdown",
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

  // Modal product layout (horizontal)
  if (product === "modal") {
    return (
      <CommandItem
        onSelect={onSelect}
        className={`cursor-pointer ${isSelected ? "bg-accent" : ""}`}
      >
        <Icon className="text-muted-foreground mr-2 h-4 w-4" />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <span className="font-medium">{item.name}</span>
            <span className="text-muted-foreground ml-2 text-sm">
              {item.code}
            </span>
          </div>
          <span className="text-muted-foreground text-xs">{item.category}</span>
        </div>
      </CommandItem>
    );
  }

  // Dropdown product layout (vertical)
  return (
    <CommandItem
      onSelect={onSelect}
      className={`cursor-pointer ${isSelected ? "bg-accent" : ""}`}
    >
      <Icon className="text-muted-foreground mr-2 h-4 w-4" />
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium">{item.name}</span>
        <span className="text-muted-foreground text-xs">
          {item.code} • {item.category}
        </span>
      </div>
    </CommandItem>
  );
}
