/**
 * Shimmer placeholder. Use it wherever the shape of the incoming content is
 * already known — table rows, KPI figures, a drawer's key/value list — instead
 * of `LoadingState`'s centred spinner, which is for a whole empty region.
 * Never shimmer for longer than ~2s of real work; past that, say what is slow.
 */
export interface SkeletonProps {
  /** Width — any CSS length. Default `100%`. With `lines > 1` the last line is 62%. */
  w?: number | string;
  /** Height in px. 12 for a label line, 16–20 for a value, 56 for a row. */
  h?: number | string;
  radius?: "sm" | "md" | "lg" | "pill";
  /** Number of stacked bars. Default 1. */
  lines?: number;
  /** Gap between stacked bars in px. Default 8. */
  gap?: number;
}
export function Skeleton(props: SkeletonProps): JSX.Element;
