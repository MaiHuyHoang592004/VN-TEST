/**
 * Craft Cut — the smooth CNC-cut transition between two GWP colour fields.
 * Sits between two stacked sections and carries the `from` colour into the `to` colour.
 */
export interface CraftCutProps {
  /** Colour of the section ABOVE the cut. */
  from?: string;
  /** Colour of the section BELOW the cut. */
  to?: string;
  /** Cut depth in px. 48–72 operational, 96–160 marketing. */
  depth?: number;
  /** Direction the blade travels. */
  sweep?: "right" | "left" | "center";
  /** `bottom` cuts into the section below; `top` mirrors it. */
  edge?: "bottom" | "top";
  style?: React.CSSProperties;
  className?: string;
}
export function CraftCut(props: CraftCutProps): JSX.Element;
