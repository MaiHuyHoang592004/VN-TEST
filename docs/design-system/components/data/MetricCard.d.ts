/**
 * KPI figure. The canonical operational treatment is `wash` (default) — a
 * semantic pastel surface with no border and no shadow, label and value set in
 * the tone's own ink. That is what the approved operational screens use.
 *
 * `card` (white fill, hairline border, tinted icon chip) is the SECONDARY
 * variant and reads as a generic SaaS KPI card. Use it at most for the single
 * introductory metric row on a dashboard — never for a whole screen.
 */
export interface MetricCardProps {
  label: React.ReactNode;
  /** The number. Rendered in the display face — this is where display type earns its place. */
  value: React.ReactNode;
  /** Change figure, e.g. "18.2%". */
  delta?: React.ReactNode;
  /** `up` renders green, `down` red. Semantics, not literal direction. */
  direction?: "up" | "down";
  /** Comparison note, e.g. "vs last 7 days". */
  deltaNote?: React.ReactNode;
  /** Lucide stroke icon — 15–16px inline in `wash`, 18–20px in the chip on `card`. */
  icon?: React.ReactNode;
  /**
   * Semantic tone. Match it to the metric's meaning, not to variety:
   * `progress` for in-flight work, `success` for completed, `critical` for
   * failure/delay, `attention` for needs-intervention, `action` for the
   * headline figure, `neutral` for a plain total.
   */
  tone?: "action" | "progress" | "success" | "critical" | "attention" | "pending" | "neutral";
  /**
   * `wash` (default, canonical) — semantic pastel surface.
   * `card` — white bordered card with icon chip. Secondary, opt-in.
   * `tile` — alias of `wash`, kept for compatibility.
   */
  variant?: "wash" | "card" | "tile";
  onClick?: () => void;
}
export function MetricCard(props: MetricCardProps): JSX.Element;
