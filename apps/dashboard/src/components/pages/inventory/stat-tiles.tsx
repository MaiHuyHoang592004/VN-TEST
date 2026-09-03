"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The headline numbers above an inventory table.
 *
 * Every value here is computed SERVER-SIDE over the whole filter — never by
 * summing the rows on screen. That is the one rule this component exists to
 * hold: the legacy page added up whatever it had rendered, so the tiles lied
 * whenever a filter matched more than one page.
 */
export type Tile = {
  label: string;
  value: number;
  /** What to print instead of the raw number — money, mostly. The VALUE still
   * decides the colour, so a negative net reads red without the formatter
   * having to know about tones. */
  display?: string;
  /** Colour the number when it is non-zero — a shortage tile that reads 0 in
   * red is noise, and one that reads 12 in grey is missed. */
  tone?: "danger" | "warning";
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
        "mb-4 grid gap-2 sm:gap-3",
        COLUMNS[tiles.length] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
      )}
    >
      {tiles.map((tile) => (
        <StatTile key={tile.label} {...tile} />
      ))}
    </div>
  );
}

function StatTile({ label, value, display, tone }: Tile) {
  const alert = tone && value > 0;
  return (
    <div className="border-border bg-card flex min-w-0 flex-col gap-0.5 rounded-lg border px-3 py-2.5">
      {/* truncate, not wrap: a two-line label pushes the number out of the column
          and the tiles stop lining up. The full text stays in the title. */}
      <p className="text-muted-foreground truncate text-xs font-medium" title={label}>
        {label}
      </p>
      <p
        className={cn(
          "truncate text-lg leading-tight font-semibold tabular-nums sm:text-xl",
          alert && tone === "danger" && "text-vercel-red",
          alert && tone === "warning" && "text-vercel-orange",
        )}
      >
        {display ?? value.toLocaleString()}
      </p>
    </div>
  );
}

/**
 * Page heading for an inventory tab.
 *
 * No tab strip here: switching between Stock and Movements is the NAVBAR's
 * job, declared once in config/nav-tabs.ts alongside every other section. A
 * second column of tabs inside the page would be the same navigation rendered
 * twice, in two different styles, that could disagree about what is active.
 */
export function InventoryHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}
