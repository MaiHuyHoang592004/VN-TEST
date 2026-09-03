/**
 * Vertical admin nav rail — light (never dark), collapsible groups. Chosen
 * over an extended TopNav for the admin surface because the real IA
 * (menu.config.jsx) is 13 groups / ~30 routes, past what a horizontal 6-8
 * item bar can hold. Operational (seller) screens keep using `TopNav`; this
 * is admin-only — the two surfaces intentionally use different shells.
 */
export interface SidebarGroup {
  heading: string;
  items: Array<{
    label: string;
    icon?: React.ReactNode;
    /** Sub-route labels. Presence makes the row an expand/collapse toggle instead of a navigate. */
    children?: string[];
  }>;
}
export interface SidebarProps {
  groups: SidebarGroup[];
  /** Currently active leaf or top-level label — matches a group item's `label` or one of its `children`. */
  active?: string;
  onNavigate?: (label: string) => void;
  /** Usually a `<GwpMark />`. */
  brand?: React.ReactNode;
  /** Usually a `<NavUser />`. */
  footer?: React.ReactNode;
  width?: number;
  /**
   * `gradient` (default) fills the rail with the sky→white dissolve
   * (`--field-rail`) and fades every rule out (`--seam-v` / `--seam-h`) instead
   * of drawing hard hairline box edges — pair it with a `--field-admin` main
   * column. `flat` is the original opaque `--surface-shell` rail with a 1px
   * right border.
   */
  field?: "gradient" | "flat";
}
export function Sidebar(props: SidebarProps): JSX.Element;
