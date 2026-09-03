/**
 * receipts — goods arriving at a customer: raise, receive, reject, evidence.
 *
 * THIS FILE IS THE PUBLIC SURFACE. Everything below it lives in `service/`,
 * one file per ACT, same as stations/service.ts and stock/service.ts.
 *
 *   service/create.ts    createReceipt, updateReceipt — the PLAN
 *   service/receive.ts   receiveShipment, rejectReceipt — the GOODS
 *   service/evidence.ts  addEvidence — photos at the dock
 *   service/list.ts      listReceipts, getReceipt, shipmentsReport
 *
 * ONE workflow for suppliers and finished goods, as everywhere else in this
 * domain: `itemType` on the receipt says which, and the lines' XOR says it
 * again per column where the database can check it.
 *
 * The rule the whole phase turns on: receiving is DELTA-BASED and MONOTONIC,
 * computed under a column lock. See service/receive.ts — it is the only place
 * that may move stock on this path.
 *
 * Legacy had approve/edit/receive endpoints at both receipt and shipment
 * level; the UI only ever called per-shipment receive, so only that is ported.
 * Completing the last shipment IS the approval.
 */
export { createReceipt, updateReceipt } from "./service/create.ts";
export { receiveShipment, rejectReceipt } from "./service/receive.ts";
export { addEvidence, type EvidenceFile } from "./service/evidence.ts";
export {
  getReceipt,
  listReceipts,
  shipmentsReport,
  type ReceiptFilter,
} from "./service/list.ts";
