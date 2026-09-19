/**
 * Two-phase ingestion.
 *
 * Phase one parses and validates into a staging table and touches nothing
 * else. Phase two applies the rows the operator confirmed. The gap between
 * them is the point: a spreadsheet is somebody's working file, and "what will
 * this do?" deserves an answer before it does it.
 */

export type HashableValue = string | number | boolean | null;

/** Whatever the parser made of one row, reduced to values worth hashing. */
export type RowValues = Readonly<Record<string, HashableValue>>;

export interface RowIssue {
  readonly field?: string;
  readonly code: string;
  readonly message: string;
}

export type RowStatus = "VALID" | "INVALID" | "SKIPPED";
export type RowAction = "CREATE" | "UPDATE" | "NONE";

export interface ParsedRow<T extends RowValues = RowValues> {
  readonly lineNumber: number;
  /** Exactly what was read, before coercion. */
  readonly raw: Readonly<Record<string, unknown>>;
  readonly values?: T;
  readonly issues: readonly RowIssue[];
}

export interface PlannedRow<T extends RowValues = RowValues> extends ParsedRow<T> {
  readonly status: RowStatus;
  readonly action: RowAction;
  /** Absent when the row never got far enough to have business content. */
  readonly rowHash?: string;
}

/**
 * One entity kind's knowledge, and the only thing that changes between
 * importing orders, a catalogue or a stock count. Everything else in this
 * module is shared.
 */
export interface ImportAdapter<T extends RowValues = RowValues> {
  readonly kind: string;
  /** Header names this adapter understands, for the column-mapping step. */
  readonly columns: readonly string[];
  /** Parse and validate one row. Never throws: a bad row is data, not an error. */
  parse(raw: Readonly<Record<string, unknown>>, lineNumber: number): ParsedRow<T>;
  /**
   * The business key this row addresses, e.g. a SKU or a channel order id.
   * Decides CREATE versus UPDATE; returns null when the row always creates.
   */
  identityOf(values: T): string | null;
  /** Which parsed fields make up the row's meaning, and so its hash. */
  readonly hashFields: readonly string[];
}

export interface PlanInput {
  /** rowHashes already applied by earlier jobs in this tenant and kind. */
  readonly appliedHashes: ReadonlySet<string>;
  /** Business keys that already exist in the domain. */
  readonly existingIdentities: ReadonlySet<string>;
}

export interface PlanSummary {
  readonly total: number;
  readonly create: number;
  readonly update: number;
  readonly invalid: number;
  readonly skipped: number;
}
