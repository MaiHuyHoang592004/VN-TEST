"use client";

import { MetricCard, type StatusTone } from "@/components/ds";
import { cn } from "@/lib/utils";

/**
 * The headline numbers above an inventory table.
 *
 * Every value here is computed SERVER-SIDE over the whole filter — never by
 * summing the rows on screen. That is the one rule this component exists to
 * hold: the legacy page added up whatever it had rendered, so the tiles lied
 * whenever a filter matched more than one page.
 *
 * Each tile is a DS `MetricCard` in its default `wash` variant, so a figure
 * carries the same tone here as the badge for the same thing does in the table
 * below it.
 */
export type Tile = {
  label: string;
  value: number;
  /** What to print instead of the raw number — money, mostly. The VALUE still
   * decides the colour, so a negative net reads red without the formatter
   * having to know about tones. */
  display?: string;
  /**
   * Tone the card when the value is NON-ZERO — a shortage tile that reads 0 in
   * red is noise, and one that reads 12 in grey is missed.
   *
   * Non-zero, not positive. The old guard was `value > 0`, which silently threw
   * away the caller's tone on a negative figure: the expenses panel passes
   * `net < 0 ? "critical" : undefined` and its net rendered grey, contradicting
   * the comment above it that said "a negative net reads red". The sign is the
   * caller's decision; this only suppresses the colour when there is nothing
   * there to colour.
   *
   * These are the DS's own StatusTone names, so a tone chosen here is the same
   * colour a StatusBadge for the same meaning would be.
   */
  tone?: StatusTone;
};

/**
 * The column fits the COUNT: six tiles sit in one column on a wide screen instead of
 * wrapping into a lonely second column, and everything collapses to two columns on
 * a phone — which is the widest a tile can be and still leave the number
 * readable at arm's length.
 *
 * Written as whole class strings rather than `lg:grid-cols-${n}`: Tailwind
 * scans source text, so an interpolated class is a class that does not exist in
 * the stylesheet.
 */
const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div
      className={cn(
        "grid gap-2 sm:gap-3",
        COLUMNS[tiles.length] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
      )}
    >
      {tiles.map(({ label, value, display, tone }) => (
        <MetricCard
          key={label}
          label={label}
          tone={tone && value !== 0 ? tone : "neutral"}
          value={display ?? value.toLocaleString()}
        />
      ))}
    </div>
  );
}
