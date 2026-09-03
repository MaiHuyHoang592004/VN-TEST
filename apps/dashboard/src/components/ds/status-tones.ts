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
 * gwp.theme.css.
 *
 * THE DS BLOCK BELOW IS VERBATIM AND CLOSED. Do not add, rename or re-tone an
 * entry in it — mirror any change back into the design system first.
 *
 * The APP BLOCK after it is a sanctioned, enumerated divergence: the DS map was
 * read from a different backend's ORDER_STATUS vocabulary, so it does not cover
 * this app's Prisma enums. Every entry there is listed with its justification
 * and its status (restated from the DS / awaiting DS ratification). Adding one
 * means adding a justification too.
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
  // ══ APP BLOCK ═══════════════════════════════════════════════════════
  // (a) RESTATED FROM THE DS — same concept, different tense.
  // The DS map came from a different backend's vocabulary ("Cancel",
  // "Refund"); this app's Prisma enum is past participle. normalise()
  // folds case and separators but deliberately does not stem, so the
  // twins never meet. These assign no new meaning.
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
  // (b) NO DS TWIN AT ANY TENSE — awaiting design-system ratification.
  // ON_HOLD was sanctioned by the migration plan, but note it is no less an
  // addition than RESOLVED: the DS has no equivalent concept for either.
  ON_HOLD: "attention",
  // TicketStatus.RESOLVED has no DS twin — the DS's ticket vocabulary is a
  // three-state model (open/in_progress/closed) and this app's is four-state.
  // Mapped to `closed`'s tone because both are terminal positive outcomes and
  // a grey "resolved" badge next to a green "closed" one reads as "nothing
  // happened". This IS inference, not restatement: it is the weakest entry in
  // this file, and it collapses two states the schema keeps distinct — the
  // same distinctness argument that keeps REFUNDED apart from CANCELLED.
  // RAISE WITH THE DESIGN SYSTEM alongside ASSIGNED.
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
