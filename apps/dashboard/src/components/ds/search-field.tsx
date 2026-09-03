"use client";

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * The search control — ported from the design system's
 * `components/forms/SearchField`.
 *
 * Presentation only: it holds no debounce and no URL state. The toolbar owns
 * the 300ms debounce and the URL push, and that logic is untouched by this
 * migration. A clear button appears once there is a value, because a filtered
 * list with no visible way back is the DS's documented empty-state trap.
 */
export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  className,
  ...rest
}: SearchFieldProps) {
  return (
    <div data-slot="search-field" className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 stroke-(--text-muted)"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={rest["aria-label"] ?? placeholder}
        className={cn("pl-9", value && "pr-9")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-(--radius-pill) text-(--text-muted) transition-colors duration-(--dur-fast) hover:bg-sky-100 hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
