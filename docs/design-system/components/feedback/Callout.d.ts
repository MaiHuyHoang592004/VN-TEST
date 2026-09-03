/**
 * Tone-coloured note banner for a caveat, confirmation, or "not yet confirmed
 * with the backend" flag inside a card or drawer. Replaces the ad-hoc
 * SourceNote() that SellerSupport, SellerWallet and SellerProductDetail were
 * each redefining locally with slightly different shapes.
 */
export interface CalloutProps {
  tone?: "success" | "progress" | "info" | "pending" | "attention" | "critical" | "neutral";
  /** Defaults to a small info-circle glyph. */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}
export function Callout(props: CalloutProps): JSX.Element;
