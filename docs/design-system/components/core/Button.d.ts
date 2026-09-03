/**
 * The GWP button — a soft PILL by default, borderless, carried by its fill and
 * one quiet shadow (the approved reference language). Action Blue is reserved
 * for the single most important action in a region.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` = Action Blue fill, white label — one per region.
   * `secondary` = white pill, Action Blue label — the "View Menu" pattern.
   * `soft` = pale sky fill, navy label — quiet brand action (the reference's
   *   soft-blue pill look, with navy ink so the label clears 4.5:1).
   * `cream` = warm pill, marketing surfaces.
   * `ghost` = transparent, navy label — LIGHT GROUNDS ONLY. Its hover swaps in
   *   a pale sky fill, so a light-labelled ghost on a dark ground goes invisible.
   * `inverse` = on-dark action: cream label, hairline cream border, hovering to a
   *   cream scrim. Use on NAVY-class grounds, where cream clears 4.5:1
   *   (navy-700 ≈ 9.5:1). NOT on `--surface-hero-deep` — cream on sky-600 is
   *   3.65:1, which is large-text only; use `cream` or `secondary` there.
   * `accent` = Yellow, marketing only, very rare. `danger` as named.
   */
  variant?: "primary" | "secondary" | "soft" | "ghost" | "inverse" | "accent" | "cream" | "danger";
  size?: "sm" | "md" | "lg";
  /** `pill` is the default everywhere; `rounded` only in dense operational toolbars. */
  shape?: "pill" | "rounded";
  /** Leading icon node — a 16px stroke icon, never an emoji. */
  icon?: React.ReactNode;
  iconAfter?: React.ReactNode;
  full?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
