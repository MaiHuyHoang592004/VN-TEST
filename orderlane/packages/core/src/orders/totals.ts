/**
 * Order arithmetic, as pure functions over minor units.
 *
 * These exist separately from the service that writes an order so that the
 * rules can be tested exhaustively without a database, and so that the API,
 * the UI's running total and the importer cannot compute a different answer
 * from each other.
 */

export interface LineAmount {
  readonly quantity: number;
  readonly unitPriceMinor: number;
}

export type TotalsIssueCode =
  | "non_positive_quantity"
  | "negative_unit_price"
  | "negative_shipping"
  | "no_lines"
  | "total_mismatch"
  | "amount_overflow";

export interface TotalsIssue {
  readonly code: TotalsIssueCode;
  readonly message: string;
  /** 0-based index of the offending line, when the issue is about one. */
  readonly lineIndex?: number;
}

/**
 * The ceiling for a single order's money columns, which are `Int` in the
 * schema. Checked here rather than left to Postgres so the error names the
 * line instead of being a constraint violation from three layers down.
 */
const MAX_MINOR = 2_147_483_647;

export function lineTotalMinor(line: LineAmount): number {
  return line.quantity * line.unitPriceMinor;
}

export function subtotalMinor(lines: readonly LineAmount[]): number {
  let total = 0;
  for (const line of lines) total += lineTotalMinor(line);
  return total;
}

export function totalMinor(lines: readonly LineAmount[], shippingMinor = 0): number {
  return subtotalMinor(lines) + shippingMinor;
}

/**
 * Everything wrong with a set of lines, at once. Same reasoning as the
 * workflow guards and the ledger validator: four problems should take one
 * round trip to discover, not four.
 */
export function validateAmounts(lines: readonly LineAmount[], shippingMinor = 0): TotalsIssue[] {
  const issues: TotalsIssue[] = [];

  if (lines.length === 0) {
    issues.push({ code: "no_lines", message: "an order needs at least one line" });
  }
  if (shippingMinor < 0) {
    issues.push({ code: "negative_shipping", message: `shipping is ${shippingMinor}; a discount is a line, not negative postage` });
  }

  lines.forEach((line, lineIndex) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      issues.push({ code: "non_positive_quantity", message: `quantity is ${line.quantity}; it must be a positive integer`, lineIndex });
    }
    if (!Number.isInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) {
      // Zero is allowed: a free gift line is a real thing. Negative is not.
      issues.push({ code: "negative_unit_price", message: `unit price is ${line.unitPriceMinor}; it must be a non-negative integer of minor units`, lineIndex });
    }
  });

  if (issues.length === 0 && totalMinor(lines, shippingMinor) > MAX_MINOR) {
    issues.push({ code: "amount_overflow", message: `order total exceeds ${MAX_MINOR} minor units, which the schema's Int columns cannot hold` });
  }

  return issues;
}

/**
 * Guards against a caller supplying totals that disagree with its own lines —
 * the API accepts totals for the client's convenience, and then checks them
 * rather than trusting them.
 */
export function checkDeclaredTotals(
  lines: readonly LineAmount[],
  declared: { subtotalMinor: number; shippingMinor: number; totalMinor: number },
): TotalsIssue[] {
  const issues: TotalsIssue[] = [];
  const computedSubtotal = subtotalMinor(lines);
  if (declared.subtotalMinor !== computedSubtotal) {
    issues.push({ code: "total_mismatch", message: `declared subtotal ${declared.subtotalMinor} but the lines add to ${computedSubtotal}` });
  }
  const computedTotal = computedSubtotal + declared.shippingMinor;
  if (declared.totalMinor !== computedTotal) {
    issues.push({ code: "total_mismatch", message: `declared total ${declared.totalMinor} but subtotal plus shipping is ${computedTotal}` });
  }
  return issues;
}
