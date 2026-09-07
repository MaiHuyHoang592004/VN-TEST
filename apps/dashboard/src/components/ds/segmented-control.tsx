"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The density / view-mode switch — ported from the design system's
 * `components/forms/SegmentedControl`.
 *
 * It is the third of three things that look alike and mean different things,
 * and the DS separates them on purpose: `FilterChip` is a set of independent
 * toggles that narrow a list, `PageTabs` is navigation between routes, and this
 * is ONE mutually-exclusive choice about how the current thing is drawn —
 * Gọn / Vừa / Đầy đủ, Lưới / Bảng. Something is always selected; there is no
 * empty state to design.
 *
 * Deliberately quiet. `FilterChip` owns the Action Blue fill because a filter
 * changes what you are looking at; a density switch does not, and a strip of
 * blue next to the filters would claim the same weight for a far smaller
 * decision. So the selected segment is the white data surface lifted off a pale
 * sky track — the same "selected is a FILL, never an underline" rule the hero
 * tabs use, one step quieter.
 *
 * Sized to sit inline in the toolbar next to search and filters, never as its
 * own row (DS rule), which is what `--control-height-sm` / `--control-height`
 * buy: it lines up with the SearchField and the pagination buttons around it.
 */

/**
 * Track and item heights are concentric: 2px of padding inside a
 * `--radius-control` (10px) track puts an 8px `--radius-xs` item exactly
 * parallel to it, which is why the item radius is a token rather than a
 * calc() nobody will maintain.
 */
const SIZES = {
  sm: {
    track: "h-(--control-height-sm)",
    item: "h-7 min-w-7 px-2.5 text-(length:--fs-body-sm)",
  },
  md: {
    track: "h-(--control-height)",
    item: "h-9 min-w-9 px-3 text-(length:--fs-body)",
  },
} as const;

export type SegmentedControlOption = {
  value: string;
  /** A word or an icon. The DS is explicit that anything longer wants a
   * `Select` instead — this control has no room to wrap. */
  label: ReactNode;
};

export type SegmentedControlProps = {
  /**
   * 2–4 options. A bare string is shorthand for `{ value: s, label: s }`, which
   * is the DS's own `.d.ts` contract and keeps `["grid", "table"]` from having
   * to be spelled out twice.
   */
  options: Array<string | SegmentedControlOption>;
  value: string;
  onChange?: (value: string) => void;
  size?: keyof typeof SIZES;
  /**
   * Accessible name for the group. A radiogroup labelled only by its own
   * options announces as "radio group" and leaves a screen-reader user to infer
   * what three unlabelled words are choosing between.
   */
  "aria-label"?: string;
  className?: string;
};

function normalize(option: string | SegmentedControlOption): SegmentedControlOption {
  return typeof option === "string" ? { value: option, label: option } : option;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  size = "sm",
  className,
  ...rest
}: SegmentedControlProps) {
  const s = SIZES[size];
  const items = options.map(normalize);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  // The selected index, or 0 when `value` matches nothing — a group where every
  // item is tabIndex={-1} is a group the keyboard cannot enter at all, so there
  // is always exactly one tab stop even if the caller passes a stale value.
  const selectedIndex = Math.max(
    0,
    items.findIndex((o) => o.value === value),
  );

  /**
   * Arrow keys MOVE the selection, they do not merely move focus.
   *
   * That is the WAI-ARIA radiogroup pattern rather than the toolbar one, and it
   * is the right choice here: every option is a display setting that is free to
   * try and instantly reversible, so selecting on arrow is discovery, not a
   * commitment. Home/End jump to the ends. Vertical arrows are honoured as well
   * as horizontal because the group wraps onto a second line on a narrow
   * toolbar, where "down" is where the next option actually is.
   */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    let next = -1;
    if (delta !== 0) next = (selectedIndex + delta + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;

    e.preventDefault();
    buttons.current[next]?.focus();
    if (items[next].value !== value) onChange?.(items[next].value);
  };

  return (
    <div
      data-slot="segmented-control"
      data-size={size}
      role="radiogroup"
      aria-label={rest["aria-label"]}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-(--radius-control) bg-sky-100 p-0.5",
        s.track,
        className,
      )}
    >
      {items.map((option, i) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            // Roving tabindex: the group is ONE tab stop, and the arrow keys
            // move within it. Tabbing through four densities to reach the next
            // control is exactly the thing the pattern exists to prevent.
            tabIndex={i === selectedIndex ? 0 : -1}
            onClick={() => !isSelected && onChange?.(option.value)}
            // Segments size to their own label rather than to equal thirds:
            // equal thirds inside a shrink-to-fit track means `flex: 1 1 0` on
            // a container with no width, which leans on intrinsic-sizing
            // behaviour that browsers still disagree about — and gets it wrong
            // by CLIPPING the longest label. `min-w` covers the icon-only case,
            // which is the one that actually needs a floor.
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-(--radius-xs)",
              "font-sans font-semibold whitespace-nowrap",
              "transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none",
              "focus-visible:shadow-(--shadow-focus) focus-visible:outline-none",
              "[&_svg]:shrink-0",
              s.item,
              isSelected
                // Selected is the white data surface lifted off the track, so
                // the state survives the grayscale test A11Y.md asks for — it
                // is a surface change and a shadow, not a hue.
                ? "bg-(--surface-data) text-navy-700 shadow-(--shadow-xs)"
                // Hover DARKENS, never lightens (DS): the track is sky-100, so
                // the unselected hover step is sky-200.
                : "text-navy-600 hover:bg-sky-200 hover:text-navy-700",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
