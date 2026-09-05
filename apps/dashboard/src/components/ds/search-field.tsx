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
 *
 * The shell is `ui/input`, not a hand-rolled `<span role="search">` as in the
 * DS bundle — one field chrome for the whole app, so focus ring, hover border
 * and the inset well never drift apart. `size` and `shape` therefore ride as
 * overrides on top of the Input's own `--control-height` / `--radius-control`
 * defaults, which is exactly what `md` + `rounded` resolve to; the defaults
 * are today's rendering, unchanged.
 */

/**
 * SearchField.d.ts: "`rounded` `md` in the top nav and above tables; `pill`
 * `lg` as the hero search in catalog." Sizes drive `--control-height-*`; only
 * `lg` bumps the type, to `--fs-body-lg`, and widens the gutter to 18px.
 */
const SIZES = {
  sm: {
    shell: "h-(--control-height-sm)",
    icon: "left-3 size-4",
    padStart: "pl-9",
    padEnd: "pr-9",
    clear: "right-2 size-6 [&_svg]:size-3.5",
    text: "",
  },
  md: {
    shell: "h-(--control-height)",
    icon: "left-3 size-4",
    padStart: "pl-9",
    padEnd: "pr-9",
    clear: "right-2 size-6 [&_svg]:size-3.5",
    text: "",
  },
  lg: {
    shell: "h-(--control-height-lg)",
    icon: "left-4.5 size-5",
    padStart: "pl-11.5",
    padEnd: "pr-11.5",
    clear: "right-3 size-7 [&_svg]:size-4",
    text: "text-(length:--fs-body-lg)",
  },
} as const;

const SHAPES = {
  /** The Input's own `--radius-control`; named so the prop reads as a choice. */
  rounded: "",
  pill: "rounded-(--radius-pill)",
} as const;

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** `md` in the top nav and above tables. `lg` is the catalog hero search. */
  size?: keyof typeof SIZES;
  /** `pill` + `lg` is the catalog hero configuration. */
  shape?: keyof typeof SHAPES;
  "aria-label"?: string;
  className?: string;
};

export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  size = "md",
  shape = "rounded",
  className,
  ...rest
}: SearchFieldProps) {
  const s = SIZES[size];

  return (
    <div data-slot="search-field" data-size={size} className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 stroke-(--text-muted)",
          s.icon
        )}
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={rest["aria-label"] ?? placeholder}
        className={cn(s.shell, s.text, SHAPES[shape], s.padStart, value && s.padEnd)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className={cn(
            "absolute top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-(--radius-pill) text-(--text-muted) transition-colors duration-(--dur-fast) hover:bg-sky-100 hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none",
            s.clear
          )}
        >
          <X />
        </button>
      )}
    </div>
  );
}
