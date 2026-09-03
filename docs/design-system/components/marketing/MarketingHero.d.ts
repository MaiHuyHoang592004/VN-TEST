/**
 * The marketing hero. Expressive CREAM display type on a large open sky field,
 * real product photography, and a deep Craft Cut into the section below.
 *
 * COLOUR RULE: headline lines are cream on the saturated sky field; the accent
 * line lifts to white. Supporting copy and proof phrases stay navy. Navy
 * headlines on sky are not the GWP direction.
 */
export interface MarketingHeroProps {
  /** Cream headline lines, one per array entry — GWP headlines break by line, not by wrap. */
  lines?: string[];
  /** The final line, lifted to white. Exactly one accent line per hero. */
  accentLine?: string;
  /**
   * `bright` (default) — white, the safe lift on a saturated sky field.
   * `action` — Action Blue. Only on pale sky or cream, where it clears contrast.
   */
  accentTone?: "bright" | "action";
  copy?: React.ReactNode;
  /** Buttons — one `primary shape="pill" size="lg"`, one `cream` or `secondary`. */
  actions?: React.ReactNode;
  /** Short proof phrases, rendered with blue check marks. Three maximum. */
  trust?: string[];
  /** Product photography node. Real personalized products, sky or cream set. */
  media?: React.ReactNode;
  /** Colour of the section below the cut. */
  cutTo?: string;
  cutDepth?: number;
}
export function MarketingHero(props: MarketingHeroProps): JSX.Element;
