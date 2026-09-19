import { createHash } from "node:crypto";

import type { HashableValue, RowValues } from "./types.ts";

/**
 * A row's identity is what it MEANS, not where it sat.
 *
 * Hashing the raw line, or including the line number, makes re-uploading a
 * corrected file look like a file of entirely new rows: insert one line near
 * the top and everything below it shifts. Hashing the parsed business fields
 * instead means a corrected file updates exactly the rows that changed.
 *
 * This module imports node:crypto, which is why it sits behind its own entry
 * point (@orderlane/core/import). Importing the workflow engine from a client
 * component must not drag a Node built-in into the browser bundle.
 */

/**
 * Normalisation, and the reasoning for each rule:
 *
 *  - NFC, because "é" typed on a Mac and "é" pasted from Windows are the same
 *    letter to a human and different bytes to a hash.
 *  - trim and collapse internal whitespace, because a spreadsheet cell's
 *    trailing space is not a business fact.
 *  - empty string becomes null, because an empty cell and a cell of spaces
 *    mean the same thing: nothing was entered.
 *
 * Case is deliberately NOT folded here. Whether "ABC-1" and "abc-1" are the
 * same SKU is the adapter's decision, made while parsing, and it is visible in
 * the staged values rather than hidden in the hash.
 */
export function normalizeValue(value: HashableValue): HashableValue {
  if (typeof value !== "string") return value;
  const normalized = value.normalize("NFC").trim().replace(/\s+/g, " ");
  return normalized === "" ? null : normalized;
}

/** Deterministic: keys sorted, so field order in the source file is irrelevant. */
export function canonicalize(values: RowValues, fields: readonly string[]): string {
  const parts: string[] = [];
  for (const field of [...fields].sort()) {
    const normalized = normalizeValue(values[field] ?? null);
    // The type tag keeps 1 and "1" apart: a SKU of "1" and a quantity of 1
    // are not the same value, and a hash that says they are will one day
    // silently drop a row.
    const tag = normalized === null ? "n" : typeof normalized === "number" ? "d" : typeof normalized === "boolean" ? "b" : "s";
    parts.push(`${field}\u0000${tag}\u0000${String(normalized)}`);
  }
  return parts.join("\u0001");
}

export function rowHash(values: RowValues, fields: readonly string[]): string {
  return createHash("sha256").update(canonicalize(values, fields), "utf8").digest("hex");
}
