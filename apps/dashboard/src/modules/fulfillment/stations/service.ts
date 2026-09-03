/**
 * stations — the customer floor: scan, fill, proof, handoff, label, quick
 * update.
 *
 * THIS FILE IS THE PUBLIC SURFACE. Everything below it lives in `service/`,
 * one file per ACT, because each act is a self-contained rule set a reader can
 * hold in their head — and because `orders/service.ts` already shows what
 * happens when one service file accretes: the money path is buried in the
 * middle of it. Callers still import the layer name (modules/README.md) and
 * never reach into `service/` directly.
 *
 *   service/group.ts    what a parcel IS — scoped lookup, shaping, basket free
 *   service/errors.ts   the refusal codes
 *   service/scan.ts     recordScan      — find the parcel and start it
 *   service/fill.ts     fillOrder       — count pieces, claim a shelf slot
 *   service/proof.ts    attachProof     — the photo, and completeHandoff
 *   service/labels.ts   linkLabel       — attach a label bought elsewhere
 *   service/quick.ts    quickUpdate     — one status across a scanned parcel
 *
 * Rules that hold in all of them: orderScope(actor) is spread into every read
 * and re-checked on every write; status moves go through
 * orders/service.applyStatusChange so the map, the audit column, resumeTo and the
 * seller's bell cannot drift from what /orders does; and webhooks fire AFTER
 * the transaction commits, never inside it.
 */
export { CONFIRM_THRESHOLD, StationError, type StationErrorCode } from "./service/errors.ts";
export {
  externalIdPrefix,
  getGroup,
  type Actor,
  type GroupRef,
  type TrackingGroup,
} from "./service/group.ts";
export { recordScan, type ScanResult } from "./service/scan.ts";
export { fillOrder } from "./service/fill.ts";
export { attachProof, completeHandoff, type ProofResult } from "./service/proof.ts";
export { linkLabel } from "./service/labels.ts";
export { quickUpdate, type QuickUpdateResult } from "./service/quick.ts";
