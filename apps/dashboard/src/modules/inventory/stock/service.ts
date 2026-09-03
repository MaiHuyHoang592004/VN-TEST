/**
 * stock — stock levels, manual corrections, and the movements ledger.
 *
 * THIS FILE IS THE PUBLIC SURFACE. Everything below it lives in `service/`,
 * one file per CONCERN, following stations/service.ts: callers import the
 * layer name and never reach into `service/` directly.
 *
 *   service/errors.ts   the refusal codes
 *   service/rows.ts     the stock ROW — the only file that knows a material's
 *                       counters live in one table and a SKU's in another
 *   service/scope.ts    which sites an actor may read and write
 *   service/ledger.ts   writeMovement + resolveNeeded — append-only history
 *   service/adjust.ts   adjustStock, quickImport — the two manual acts
 *   service/list.ts     listStock, listMovements — the reads behind /inventory
 *
 * ONE module serves suppliers AND finished goods. An `itemType` discriminator
 * picks the table; the guards, the counter arithmetic, the ledger and the
 * shortage bookkeeping are written once. Legacy had two of each and they
 * disagreed, most famously about whether reserving decrements onHand.
 *
 * Rules that hold in all of them: no count is EVER written outside a
 * $transaction that also writes its movement column; a count never goes below
 * zero, and the guard lives in the UPDATE's WHERE rather than in a
 * read-then-write, because two writers would both pass a read; and every
 * mutation calls assertSite, because an id posted by a client is not
 * authorization.
 *
 * The availability formula is NOT here — it lives in ../counters.ts, prisma-
 * free so the browser can call the same function the reservation guard does.
 */
export { InventoryError, type InventoryErrorCode } from "./service/errors.ts";
export {
  addToNeeded,
  addToOnHand,
  assertItemExists,
  itemColumns,
  itemWhere,
  readStock,
  type ItemRef,
  type Tx,
} from "./service/rows.ts";
export { assertSite, readableSites, siteWhere, type Actor } from "./service/scope.ts";
export {
  resolveNeeded,
  writeMovement,
  type MovementInput,
  type MovementType,
} from "./service/ledger.ts";
export { adjustStock, quickImport } from "./service/adjust.ts";
export {
  listMovements,
  listStock,
  type MovementFilter,
  type StockFilter,
  type StockRow,
} from "./service/list.ts";
