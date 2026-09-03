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
 * COVERAGE. Because toneFor() is the app's single authority for status colour,
 * a value that is not here does not render "no opinion" — it renders a neutral
 * pill that looks exactly like a decision. So every value of every `*Status`
 * enum in libs/db/prisma/schema/enums/ has been walked, and each got exactly
 * one of three outcomes, written down where the value is:
 *   1. restated from the DS  — same concept, different spelling or tense;
 *      the DS spelling is cited (CANCELLED/Cancel, RETURNED/Return).
 *   2. inferred, awaiting DS ratification — no DS twin at any spelling, but a
 *      neutral pill would actively mislead (BANNED, FAILED, REJECTED).
 *   3. deliberately neutral — the DS has no view and neutral is honest; the
 *      reason is written out (ASSIGNED, and the block listing the rest).
 * status-tones.test.ts reads the .prisma schema and fails if any value of any
 * `*Status` enum lacks an explicit assertion, so a silent neutral cannot be
 * introduced by adding an enum value.
 *
 * ONE FLAT MAP, KEYED BY STRING — a deliberate limit, not an oversight.
 * The DS's own status-tones.json is flat and keyed by string, so this mirrors
 * its shape. The consequence is that a key is SHARED by every enum that spells
 * a value the same way: TransactionStatus.CANCELLED inherits the tone argued
 * for FulfillmentStatus.CANCELLED, and ACTIVE / PENDING / DRAFT / RESERVED are
 * each shared by three or more enums. No current collision is wrong, and each
 * shared key is pinned by a test naming every enum that reaches it.
 *
 * If the design system ever wants one spelling to differ per domain, the fix
 * is `toneFor(status, domain?)` with an OPTIONAL second argument — additive, so
 * no existing call site breaks. That keeps it cheap to do later, which is why
 * it is not being done pre-emptively now.
 *
 * NOT COVERED HERE, ON PURPOSE:
 *   - `TicketPriority` (LOW/MEDIUM/HIGH/URGENT) is a priority, not a status.
 *     Render it with StatusBadge's explicit `tone` prop, driven by the
 *     TICKET_REASON -> priority mapping read verbatim from DOMAIN_RESOLVED.md.
 *     Never route it through toneFor(): URGENT would silently come out grey.
 *   - `InventoryMovementType.RETURN` is a movement TYPE that happens to collide
 *     with the DS's `Return` status key. Do not pass it to toneFor().
 *   - `Shipment.trackingStatus` is a free-form string with no enum
 *     (BACKEND_GAPS.md). Everything in that column resolves to neutral, which
 *     is correct-but-useless; it needs a backend vocabulary before it can be
 *     coloured, and inventing one here is exactly what this file forbids.
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
  // ReservationStatus.RETURNED — the same bridge as CANCELLED/Cancel: the DS
  // spells the concept "Return" (present tense, a different backend's noun),
  // this app's enum is the past participle. normalise() does not stem, so the
  // twins never meet on their own. No new meaning is assigned.
  RETURNED: "attention", // DS: Return -> attention
  // ReceiptStatus.COMPLETE — the DS spells it "Completed". Same word, same
  // concept, one suffix apart; restatement, not inference.
  COMPLETE: "success", // DS: Completed -> success
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
  // TransactionStatus.FAILED — a failed money movement. The DS has no bare
  // "Failed"; its nearest entry is the unrelated "Asset processing failed",
  // so this is NOT a restatement. Mapped anyway because a failed top-up or
  // refund rendering the same neutral pill as "Processing" tells the reader
  // nothing happened when in fact money did not move. INFERRED — RAISE WITH
  // THE DESIGN SYSTEM.
  FAILED: "critical",
  // UserStatus.BANNED — an account deliberately barred. No DS twin (the DS
  // vocabulary is order-shaped and has no account lifecycle at all). A banned
  // user reading as the same neutral pill as "Inactive" hides the one user
  // state that changes what an operator may do. INFERRED — RAISE WITH THE
  // DESIGN SYSTEM.
  BANNED: "critical",
  // ReceiptStatus.REJECTED and ReceiptShipmentStatus.REJECTED — one key serves
  // both; the two enums use the value for the same event (goods refused at
  // receiving). No DS twin. Mapped because a rejected receipt is an unresolved
  // physical discrepancy on the floor: stock that is not there and money that
  // may already have been paid. INFERRED — RAISE WITH THE DESIGN SYSTEM.
  REJECTED: "critical",
  // BasketPositionStatus.BROKEN — a physical basket position that cannot hold
  // stock. No DS twin. Mapped because it is the only value in that enum that
  // requires somebody to walk to the rack; the other three are ordinary
  // occupancy states. INFERRED — RAISE WITH THE DESIGN SYSTEM.
  BROKEN: "critical",
  // ── DELIBERATELY NOT MAPPED ──────────────────────────────────────────
  // Every value below was considered and left to toneFor()'s neutral default
  // on purpose. The rule applied, and the reason each entry above clears it:
  // a value is mapped only when the DS already names the concept, or when a
  // neutral pill would actively mislead about risk or about work outstanding.
  // A benign resting or terminal state is not misleading in neutral — neutral
  // correctly says "nothing to act on". Inventing a tone to make a table look
  // finished is the failure this file exists to prevent. All of these are
  // listed in the Task 4 report for the design system to rule on, and each is
  // pinned by an explicit assertion in status-tones.test.ts so that changing
  // one is a decision rather than an accident.
  //
  //   FulfillmentStatus.ASSIGNED  — assigned to a warehouse, not yet in
  //     production. The DS has no equivalent concept; choosing between
  //     `pending`, `progress` and `neutral` would be inventing vocabulary.
  //   UserStatus.INACTIVE, ProductStatus.INACTIVE, WarehouseStatus.INACTIVE,
  //   BomStatus.INACTIVE — a deliberate resting state, the exact opposite of
  //     the DS's `Active`. The DS gives no tone for the negative pole, and
  //     nothing is outstanding, so neutral is honest.
  //   ProductStatus.DRAFT, BomStatus.DRAFT — pre-publication working state.
  //   ProductStatus.ARCHIVED — retired on purpose; nothing to act on.
  //   InviteStatus.ACCEPTED — benign terminal success, but with no DS twin at
  //     any tense. `Completed`/`Fulfilled` are order words, not invitation
  //     words; borrowing one would be inference with no reader harm to
  //     justify it. Best candidate for DS ratification as `success`.
  //   InviteStatus.REVOKED, InviteStatus.EXPIRED — the invite is simply no
  //     longer usable, and the remedy is to send another. Neither is a
  //     failure a reader must not miss, so neither earns `critical`.
  //   TransactionStatus.CANCELLED, FulfillmentStatus.CANCELLED share the
  //     CANCELLED key above and therefore both render `critical` — see the
  //     report; this is a consequence of one flat map, not a second decision.
  //   ReceiptStatus.PARTIAL, ReceiptShipmentStatus.PARTIAL_RECEIVED — genuinely
  //     in flight, so `progress` is tempting, but the DS's `progress` entries
  //     (`In Production`, `Filled`) are production-line states and a partial
  //     receipt is not one. Awaiting a DS ruling rather than a guess.
  //   ReceiptShipmentStatus.RECEIVED — terminal positive, no DS twin;
  //     ReceiptStatus.COMPLETE is mapped only because the DS spells it
  //     `Completed`, and no such spelling exists for RECEIVED.
  //   ReservationStatus.RESERVED, CONSUMED, RELEASED — the ordinary path of a
  //     reservation through its life. None is an outcome a reader must not
  //     miss, and the DS models no reservation lifecycle.
  //   BasketPositionStatus.AVAILABLE, RESERVED, OCCUPIED — ordinary occupancy.
  //     `In Stock` -> success is about stock levels, not rack occupancy, so it
  //     is not a twin.
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
