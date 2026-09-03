/**
 * The operational table. Calm by construction: no vertical rules, hairline row
 * separators, uppercase micro headers, sky hover.
 */
export interface DataTableColumn {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
  /** Render the cell in IBM Plex Mono — Order IDs, SKUs, tracking numbers. */
  mono?: boolean;
  /** Bold body weight — the row's identifying column. */
  strong?: boolean;
  /** Muted navy — timestamps and secondary facts. */
  muted?: boolean;
  /** Allow wrapping. Off by default; operational rows stay one line. */
  wrap?: boolean;
  /** Custom cell renderer — return a StatusBadge, ProductCell, IconButton row, etc. */
  render?: (row: any) => React.ReactNode;
  /**
   * Hide the cell until its row is hovered or focused — for row-action columns,
   * so a table of 25 rows is not 75 competing buttons. Progressive disclosure of
   * a path that must ALSO exist elsewhere (`onRowClick` → drawer): never put a
   * destructive or unique action behind hover alone.
   */
  revealOnHover?: boolean;
}

export interface DataTableProps {
  columns?: DataTableColumn[];
  rows?: any[];
  /** 48px rows instead of 56px — for scan-heavy warehouse views. */
  dense?: boolean;
  /** Cream alternate rows. Use only on tables wider than ~10 columns. */
  zebra?: boolean;
  /**
   * `data` (default) = white cells, for a table inside a card.
   * `field` = transparent cells, for a FRAMELESS table sitting straight on the
   * admin sky→white dissolve field — no card, no outer border, row rules only.
   */
  surface?: "data" | "field";
  /**
   * Sticky header row, pinned this many px from the top of the viewport. Prefer
   * the CSS variable the chrome publishes over a literal — `AdminBar` writes its
   * rendered height to `--admin-bar-h`, so `stickyHeader="var(--admin-bar-h, 64px)"`
   * keeps the header glued to the bar's real bottom edge as it condenses; on a
   * `TopNav` screen use `"var(--nav-height, 64px)"`. Implies an opaque white
   * header ground, and switches the wrapper's horizontal overflow to `visible`
   * (a scrolling wrapper would capture the sticky position); very wide tables
   * then scroll at page level.
   */
  stickyHeader?: number | string | null;
  onRowClick?: (row: any) => void;
  /** Node shown when `rows` is empty — normally an `<EmptyState />`. */
  empty?: React.ReactNode;
  /** Node below the last row — normally a `<Pagination />`. */
  footer?: React.ReactNode;
}
export function DataTable(props: DataTableProps): JSX.Element;
