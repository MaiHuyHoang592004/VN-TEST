/**
 * The surface primitive that enforces the SKY → CREAM → WHITE hierarchy.
 * Use it for every panel; do not hand-roll a white box with a shadow.
 */
export interface SurfaceProps {
  /**
   * `canvas` = sky brand ground, `content` = cream, `data` = white nested zone,
   * `inset` = pale sky well, `sheet` = soft white→palest-sky sheet for panels
   * sitting on the admin sky→white dissolve field (`--field-admin`).
   */
  level?: "canvas" | "content" | "data" | "inset" | "sheet";
  radius?: "sm" | "md" | "lg" | "xl" | "2xl" | "card" | "surface" | "hero";
  shadow?: "none" | "xs" | "sm" | "md" | "lg";
  /** 1px `--border-soft` hairline. Required on `level="sheet"`, where the border does the delineating instead of a filled box. */
  outline?: boolean;
  pad?: boolean;
  /** Optional header title, set in the display face. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Node pinned to the right of the header — a Select, link or small Button. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}
export function Surface(props: SurfaceProps): JSX.Element;
