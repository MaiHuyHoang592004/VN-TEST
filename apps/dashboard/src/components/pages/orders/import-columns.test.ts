/**
 * The CSV grammar. Small, but every rule here is one a real spreadsheet hits:
 * Excel writes a BOM, addresses contain commas, and notes contain quotes.
 * Getting any of them wrong shifts every later row by one and imports
 * garbage that validates fine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCsv, COLUMN_ALIASES } from "./import-columns.ts";

test("plain rows split on commas", () => {
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("a quoted field keeps its commas", () => {
  // The single most common real case: a street address.
  assert.deepEqual(parseCsv('id,addr\n1,"12 Main St, Apt 4"'), [
    ["id", "addr"],
    ["1", "12 Main St, Apt 4"],
  ]);
});

test("doubled quotes are one literal quote", () => {
  assert.deepEqual(parseCsv('note\n"she said ""hi"""'), [["note"], ['she said "hi"']]);
});

test("a quoted field may contain newlines", () => {
  assert.deepEqual(parseCsv('note\n"line one\nline two"'), [["note"], ["line one\nline two"]]);
});

test("CRLF is one column break, not two", () => {
  // Excel writes CRLF; treating \r and \n separately would insert a blank column
  // between every real one.
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

test("Excel's BOM does not corrupt the first header", () => {
  // Without stripping it the header is "﻿Order ID", which matches no
  // alias, so every column would import without an order id.
  const [header] = parseCsv('﻿Order ID,Quantity\nA-1,2');
  assert.equal(header[0], "Order ID");
  assert.equal(COLUMN_ALIASES[header[0]], "externalId");
});

test("blank lines are skipped, not imported as empty orders", () => {
  assert.deepEqual(parseCsv("a\n1\n\n2\n"), [["a"], ["1"], ["2"]]);
});
