/**
 * The GoodWoodPrint lockup. Defaults to a type-set lockup in the display face,
 * which is the correct mark to use in product UI.
 *
 * ── COLOUR RULE ─────────────────────────────────────────────────────────────
 * The logo is BRAND LIGHT, not information ink:
 *   · on cream, white or the floating nav shell → light sky (`tone="sky"`, default)
 *   · on bright sky                             → cream (`tone="cream"`)
 *   · navy                                      → rare technical / utility only
 *
 * Navy is an information colour. A navy mark reads heavy, corporate and
 * administrative, so it is NEVER the default brand mark — only favicons,
 * watermarks, technical stamps, and data zones needing very high contrast.
 * ────────────────────────────────────────────────────────────────────────────
 */
export interface GwpMarkProps {
  /** `type` = set in Baloo 2 (default, scalable). `image` = the supplied brand PNG. */
  variant?: "type" | "image";
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * `sky` (default) — light sky on cream, white and the nav shell.
   * `sky-strong` — one step deeper (sky-600, 3.7:1 on cream); use at small
   *   sizes or inside dense data zones where the mark must hold up.
   * `cream` / `white` — the inverse mark, on bright sky fields.
   * `navy` — technical/utility only. Not a brand-moment colour.
   */
  tone?: "sky" | "sky-strong" | "cream" | "white" | "navy";
  /** `stacked` for nav, `inline` for footers/emails, `monogram` for favicons, props and loaders. */
  lockup?: "stacked" | "inline" | "monogram";
  /** Image path, relative to the consuming page. */
  src?: string;
  style?: React.CSSProperties;
}
export function GwpMark(props: GwpMarkProps): JSX.Element;
