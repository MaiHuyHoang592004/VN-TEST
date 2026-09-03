/**
 * Status pill for fulfilment, tracking, stock and ticket states.
 * Pass the literal backend status string — the component maps it to a tone.
 *
 * ── DOMAIN-VERIFIED ────────────────────────────────────────────────
 * The status vocabulary is fixed by, and was read from:
 *   `fulfillment-system-be-prod/src/constants/common.ts` — ORDER_STATUS
 *   `fulfillment-system-be-prod/src/ticket/ticket.enum.ts` — TicketStatus, TicketPriority
 *
 * DOMAIN-BOUND (not modelled here): transitions between statuses, the
 * production lifecycle, the shipping lifecycle, and the value set of the
 * separate `tracking_status` field — that field exists on the order but its
 * vocabulary does not appear as an enum, so do not assume it matches
 * ORDER_STATUS.
 * ───────────────────────────────────────────────────────────────
 */
export interface StatusBadgeProps {
  /** The status text as it exists in the system, e.g. "In Production", "Design problems", "open". */
  status: string;
  /** Override the auto-mapped tone. Only for statuses outside the known set. */
  tone?: "success" | "progress" | "info" | "pending" | "attention" | "critical" | "neutral";
  dot?: boolean;
  size?: "sm" | "md";
  /** Slow pulse on the dot — for genuinely in-flight states (Validating, Mockup Generating). */
  pulse?: boolean;
}
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
/** status string → semantic tone. Extend only when the backend enum changes. */
export const STATUS_TONES: Record<string, string>;
