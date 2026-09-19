import { rowHash } from "./row-hash.ts";
import type {
  ImportAdapter,
  ParsedRow,
  PlanInput,
  PlanSummary,
  PlannedRow,
  RowValues,
} from "./types.ts";

/**
 * Decide what each staged row would do, without doing any of it.
 *
 * This is the whole preview screen, as one pure function — which is why the
 * number an operator is shown and the work the commit step performs cannot
 * disagree: they are the same computation, run twice.
 */
export function planImport<T extends RowValues>(
  rows: readonly ParsedRow<T>[],
  adapter: ImportAdapter<T>,
  input: PlanInput,
): PlannedRow<T>[] {
  const seenInThisFile = new Set<string>();
  const planned: PlannedRow<T>[] = [];

  for (const row of rows) {
    if (row.issues.length > 0 || !row.values) {
      planned.push({ ...row, status: "INVALID", action: "NONE" });
      continue;
    }

    const hash = rowHash(row.values, adapter.hashFields);

    // Applied by an earlier job: re-uploading a file that partly overlaps a
    // previous one is normal, and the overlap is a no-op rather than an error.
    if (input.appliedHashes.has(hash)) {
      planned.push({ ...row, rowHash: hash, status: "SKIPPED", action: "NONE" });
      continue;
    }

    // The same row twice inside ONE file. A separate case from the one above,
    // because the unique constraint would reject the second write at commit
    // time and take the whole batch's transaction with it if we did not catch
    // it here.
    if (seenInThisFile.has(hash)) {
      planned.push({
        ...row,
        rowHash: hash,
        status: "SKIPPED",
        action: "NONE",
        issues: [
          ...row.issues,
          { code: "duplicate_in_file", message: "an earlier row in this file has the same content" },
        ],
      });
      continue;
    }
    seenInThisFile.add(hash);

    const identity = adapter.identityOf(row.values);
    const action = identity !== null && input.existingIdentities.has(identity) ? "UPDATE" : "CREATE";
    planned.push({ ...row, rowHash: hash, status: "VALID", action });
  }

  return planned;
}

export function summarize(rows: readonly PlannedRow[]): PlanSummary {
  let create = 0;
  let update = 0;
  let invalid = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.status === "INVALID") invalid++;
    else if (row.status === "SKIPPED") skipped++;
    else if (row.action === "CREATE") create++;
    else if (row.action === "UPDATE") update++;
  }
  return { total: rows.length, create, update, invalid, skipped };
}
