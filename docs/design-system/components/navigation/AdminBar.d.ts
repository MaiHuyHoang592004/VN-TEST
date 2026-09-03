/**
 * The admin shell's chrome bar — the sibling of `TopNav` (seller) and the
 * replacement for a hand-rolled `<header>` on admin screens. By default it is
 * the SAME bar as `TopNav variant="bar" surface="white"` on AdminDashboard:
 * 64px, opaque white, one hairline, constant height — so every admin screen,
 * rail or no rail, wears one identical top bar. `surface="transparent"` is the
 * dissolve-field variant: no fill at rest, condensing to a white 52px bar once
 * the page scrolls past the sky band.
 *
 * It deliberately owns NO page CTA — like `PageHero`, actions belong in the
 * toolbar row or the table's own header.
 *
 * While mounted it publishes its rendered height as `--admin-bar-h` on
 * `:root`, so a sticky table header can pin to the bar's real bottom edge:
 * `<DataTable stickyHeader="var(--admin-bar-h, 64px)" />`.
 */
export interface AdminBarProps {
  /** Page / module name. Display face — 18px on `white`, 24px→18px condensing on `transparent`. */
  title?: React.ReactNode;
  /** Right-hand chrome — a `SearchField`, `IconButton`, `NavUser`, ⌘K trigger. */
  right?: React.ReactNode;
  /**
   * Brand lockup at the left end, for an admin screen with no `Sidebar` to
   * carry it (a workstation screen). Omit when the rail already shows the mark.
   */
  brand?: React.ReactNode;
  /**
   * `"white"` (default) — the AdminDashboard bar: opaque white, hairline,
   * constant `height`, title at 18px. `"transparent"` — the sky→white dissolve
   * field variant that condenses on scroll.
   */
  surface?: "white" | "transparent";
  /** Resting height in px. Default 64 (the system's nav height). */
  height?: number;
  /** Condensed height in px. Default 52. `transparent` only. */
  condensedHeight?: number;
  /** Scroll offset in px at which the bar condenses / reveals its title. Default 28. */
  condenseAt?: number;
  /**
   * Hide the bar's title until the bar condenses — for a page that carries its
   * own 32px display title in the content, so the two never shout at once. The
   * bar's copy then renders as a `div`, not a second `<h1>`.
   */
  revealTitleOnScroll?: boolean;
  /** Set false for a bar that scrolls away (print views, embedded frames). Sticky mode listens for scroll in the capture phase, so it also condenses inside hosts that scroll an inner element. */
  sticky?: boolean;
}
export function AdminBar(props: AdminBarProps): JSX.Element;
