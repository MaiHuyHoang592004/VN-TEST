/**
 * Operational page header — a large open SKY field holding the page title, cut
 * into the content surface with a Craft Cut. One per screen, always at the top.
 *
 * COLOUR RULE: display ink follows the surface. On the saturated sky field the
 * title renders CREAM (`--display-on-sky`) so the page reads light and
 * brand-forward; eyebrow and subtitle stay navy because they are functional
 * text. On pale sky or cream the title is navy. Navy display type on saturated
 * sky is the generic-SaaS look this rule exists to prevent.
 *
 * The operational hero owns NO CTA by design. Operational actions belong in
 * `TopNav.cta`, `SearchShell.action` or `TabBar.right`. A hero with a primary
 * button in the corner is the generic-SaaS page-header pattern, and this
 * component deliberately makes it unavailable. `MarketingHero` keeps its CTAs;
 * `CatalogHero` follows catalog rules.
 */
export interface PageHeroProps {
  /** Page title, set in the display face. */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small uppercase eyebrow above the title — breadcrumb or module name. */
  meta?: React.ReactNode;
  /** Workshop line-art illustration node. Line art in operational heroes — never photography. */
  art?: React.ReactNode;
  /**
   * `sky` (default) — the saturated brand field, cream display title.
   * `deep` — sky-600. Mid-luminance: NO ink in the palette clears 4.5:1 on it,
   *   so it carries the large cream display title (3.65:1, AA large) and nothing
   *   else. The eyebrow and subtitle are automatically moved onto nested light
   *   chips; never place small text directly on this ground, and never reduce it
   *   with opacity.
   * `soft` — pale sky-200, navy title.
   * `cream` — warm surface, navy title.
   */
  tone?: "sky" | "deep" | "soft" | "cream";
  rings?: boolean;
  /** Whether to render the Craft Cut into the surface below. */
  cut?: boolean;
  /** Colour of the surface below the cut. */
  cutTo?: string;
  size?: "sm" | "md" | "lg";
  /** Secondary content inside the hero — a status summary line, a date. Not actions. */
  children?: React.ReactNode;
}
export function PageHero(props: PageHeroProps): JSX.Element;
