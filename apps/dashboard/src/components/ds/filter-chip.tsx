"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A canned filter — ported from the design system's
 * `components/forms/FilterChip`.
 *
 * Chips are FILTERS, not navigation: they carry `aria-pressed`, not
 * `aria-current`. The active chip is an Action Blue fill; inactive chips are
 * white pills with navy ink so a strip of them does not compete with the one
 * primary button the region is allowed.
 */
export type FilterChipProps = {
  label: ReactNode;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
};

export function FilterChip({ label, active = false, count, onClick, className }: FilterChipProps) {
  return (
    <button
      type="button"
      data-slot="filter-chip"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-(--radius-pill) px-3.5",
        "font-sans text-(length:--fs-body-sm) font-bold tracking-(--ls-label) whitespace-nowrap",
        "transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none",
        "focus-visible:shadow-(--shadow-focus) focus-visible:outline-none",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-(--surface-data) text-navy-700 shadow-(--shadow-xs) hover:bg-sky-50",
        className
      )}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={cn(
            "rounded-(--radius-pill) px-1.5 font-mono text-(length:--fs-micro)",
            active ? "bg-cream-100/25 text-primary-foreground" : "bg-sky-100 text-navy-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
