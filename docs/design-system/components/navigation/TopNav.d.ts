/**
 * The GWP top navigation: a warm cream surface FLOATING on the sky canvas, with
 * sky visible around a rounded shell and one quiet shadow. This is the canonical
 * operational navigation — GWP never uses a dark or vertical sidebar, and never a
 * full-bleed generic SaaS header.
 *
 * Passive items are navy, the active item is a pale sky pill, and Action Blue
 * appears only in `cta`.
 */
export interface TopNavProps {
  /** Nav labels, `{ label }` objects, or `{ label, children:[{label,onClick}] }`
   * for a dropdown group (e.g. TÍCH HỢP → API Keys / TTS Shops / TTS Orders).
   * Keep the primary set to 6–8 top-level items. */
  items?: Array<string | { label: string; children?: Array<{ label: string; onClick?: () => void }> }>;
  /** Label of the current item — renders as a filled sky pill. */
  active?: string;
  onNavigate?: (label: string) => void;
  /** Brand lockup node — normally `<GwpMark />`. */
  brand?: React.ReactNode;
  /** A `<SearchField />`. */
  search?: React.ReactNode;
  /** Icon buttons (notifications, help). */
  actions?: React.ReactNode;
  /**
   * The emphasized global action, and the ONLY place Action Blue appears in the
   * nav. Operational page CTAs live here, in `SearchShell.action` or in
   * `TabBar.right` — never in `PageHero`.
   */
  cta?: React.ReactNode;
  /** A `<NavUser />`. */
  user?: React.ReactNode;
  /**
   * `floating` (default, canonical) — rounded cream shell with sky around it.
   * `bar` — full-bleed cream bar. Only for surfaces with no sky canvas behind
   * the nav; it is the non-canonical fallback.
   */
  variant?: "floating" | "bar";
  /**
   * `cream` (default) is the brand shell — seller app and marketing.
   * `white` is the admin / dashboard bar: white ground, sky logo, pale-sky
   * active pill, sky-50 hover, one bright CTA. Use with `variant="bar"`.
   */
  surface?: "cream" | "white";
  sticky?: boolean;
}
export function TopNav(props: TopNavProps): JSX.Element;

export interface NavUserProps {
  name?: string;
  /**
   * Role label. DOMAIN-VERIFIED against `USER_ROLE` in
   * `fulfillment-system-be-prod/src/constants/common.ts`:
   * admin · customer (the seller) · warehouse · warehouse_external ·
   * warehouse_admin · supporter · designer.
   *
   * Do not invent role names. Permission and visibility behaviour is
   * DOMAIN-BOUND and is the app's concern, not this component's.
   */
  role?: string;
  /** Image node, or omit to fall back to the initial. */
  avatar?: React.ReactNode;
  /** Account dropdown — e.g. [{label:"Hồ sơ",onClick},{label:"Đăng xuất",onClick}]. Omit for a purely decorative block. */
  menu?: Array<{ label: string; onClick?: () => void }>;
}
export function NavUser(props: NavUserProps): JSX.Element;
