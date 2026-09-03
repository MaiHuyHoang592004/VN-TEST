/**
 * The canonical status → tone map.
 *
 * SOURCE OF TRUTH: docs/design-system/tokens/status-tones.json, copied
 * verbatim. The DS resolved (ALIGNMENT_AUDIT §T4) that these seven semantic
 * tones are canonical for all UI, and that the backend's `metadata.ts`
 * `theme`/`color` hex literals — served by `GET /api/metadata` — are the
 * pre-rebrand pastel palette and must be treated as dead data. Never read
 * them for chrome; never hand-pick a badge colour at a call site.
 *
 * Tones resolve to colour through the `--status-<tone>-{bg,fg,dot}` tokens in
 * gwp.theme.css. Adding a key here is a design-system change: mirror it back
 * into the DS's status-tones.json rather than diverging.
 *
 * DOMAIN-BOUND (per StatusBadge.d.ts): the transitions between statuses, the
 * production lifecycle, the shipping lifecycle, and the value set of the
 * separate `tracking_status` field are NOT modelled here. `tracking_status`
 * exists on the order but has no enum, so it is not assumed to match
 * ORDER_STATUS — an unrecognised value renders neutral, which is correct.
 */
export type StatusTone =
  | "success"
  | "progress"
  | "info"
  | "pending"
  | "attention"
  | "critical"
  | "neutral";

export const STATUS_TONES: Readonly<Record<string, StatusTone>> = Object.freeze({
  Fulfilled: "success",
  Completed: "success",
  Produced: "info",
  Shipped: "info",
  Delivered: "success",
  Active: "success",
  "In Stock": "success",
  Refund: "info",
  "In Production": "progress",
  Filled: "progress",
  Processing: "neutral",
  Validating: "neutral",
  "Mockup Generating": "neutral",
  Pending: "pending",
  "Production Ready": "pending",
  Return: "attention",
  "Low Stock": "attention",
  "Wrong Label": "attention",
  "Design problems": "attention",
  Cancel: "critical",
  Delayed: "critical",
  "Out Of Stock": "critical",
  "Asset processing failed": "critical",
  open: "attention",
  in_progress: "progress",
  closed: "success",
  // Prisma FulfillmentStatus values with no prose twin in the DS map. Not new
  // vocabulary — they are the existing DB enum, tone-assigned by the same
  // rules the DS applies to its own list.
  // ── App enum values whose DS twin exists under a different tense ──────
  // The DS map was read from a DIFFERENT backend's ORDER_STATUS vocabulary
  // ("Cancel", "Refund"), while this app's Prisma `FulfillmentStatus` is past
  // participle ("CANCELLED", "REFUNDED"). normalise() lowercases and collapses
  // separators but deliberately does not stem, so the twins never meet. These
  // entries bridge that gap; they assign no new meaning, they restate the DS's
  // own tone for the same concept. Without them a cancelled order renders a
  // grey badge, which is the one status a reader must not miss.
  CANCELLED: "critical", // DS: Cancel -> critical
  // Kept distinct from CANCELLED on purpose: schema comment on the enum says
  // the ~319 legacy "Refund" orders must stay reportable as refunds rather
  // than plain cancellations, and the DS gives Refund its own tone.
  REFUNDED: "info", // DS: Refund -> info
  ON_HOLD: "attention",
  // TicketStatus.RESOLVED has no DS twin — the DS's ticket vocabulary is
  // open/in_progress/closed. It is mapped to the same tone as `closed`
  // because both are terminal positive outcomes; a grey "resolved" badge
  // would read as "nothing happened".
  RESOLVED: "success",
  // NOT MAPPED, deliberately: FulfillmentStatus.ASSIGNED. The DS has no
  // equivalent concept (assigned to a warehouse, not yet in production) and
  // guessing between `pending`, `progress` and `neutral` would be inventing
  // vocabulary. toneFor() returns "neutral", which is the correct default for
  // a state the design system has not ruled on. Raised with the DS.
});

/** Normalise so SCREAMING_SNAKE, Title Case and spaced prose collapse to one key. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

const NORMALISED: ReadonlyMap<string, StatusTone> = new Map(
  Object.entries(STATUS_TONES).map(([key, tone]) => [normalise(key), tone]),
);

/**
 * The status string as it exists in the system → its semantic tone.
 * Unknown, empty and nullish statuses are `neutral`: never throw, and never
 * invent a colour for vocabulary the design system has not seen.
 */
export function toneFor(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  return NORMALISED.get(normalise(status)) ?? "neutral";
}
