/**
 * The control bar above any grid or table: filters on the left, result count
 * and sort/view controls on the right.
 *
 * Also the canonical home for an operational page CTA. `PageHero` owns no
 * actions, so "New Order" / "New Product" lives in `action` here, in
 * `TopNav.cta`, or in `TabBar.right`.
 */
export interface SearchShellProps {
  /** Left cluster — SearchField, FilterChips, Selects. */
  left?: React.ReactNode;
  /** Result count string, e.g. "Showing 1–12 of 482 products". */
  resultCount?: React.ReactNode;
  /** A `<Select size="sm">` for sort order. */
  sort?: React.ReactNode;
  /** Enables the grid/list toggle when set. */
  view?: "grid" | "list";
  onViewChange?: (view: "grid" | "list") => void;
  /**
   * The region's primary action, pinned to the far right. One per shell.
   * This is where an operational page CTA belongs — never in `PageHero`.
   */
  action?: React.ReactNode;
}
export function SearchShell(props: SearchShellProps): JSX.Element;
