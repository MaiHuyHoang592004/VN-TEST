/**
 * Concentric tree-ring background motif — the primary GWP brand watermark.
 * Absolutely positioned; give the parent `position: relative; overflow: hidden`.
 * Never place it behind tables or dense operational data.
 */
export interface WoodRingsProps {
  /** Diameter in px. 320–760 for corner details, 900+ for full brand moments. */
  size?: number;
  /** Ring colour family. `navy` on light surfaces, `cream` on sky, `sky` on cream. */
  tone?: "navy" | "cream" | "sky";
  /** Ring opacity step. `soft` for anything near content. */
  strength?: "soft" | "medium" | "strong";
  /** Which edge the ring cluster is cropped against. */
  anchor?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";
  /** Inset from that edge — negative values crop the rings (the intended look). */
  offset?: string;
  /** px between rings. 10 = tight/young wood, 20 = open/old wood. */
  spacing?: number;
  rotate?: number;
  style?: React.CSSProperties;
  className?: string;
}
export function WoodRings(props: WoodRingsProps): JSX.Element;
