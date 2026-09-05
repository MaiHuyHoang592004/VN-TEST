/**
 * Spreadsheet header → field name.
 *
 * Lifted from the legacy importer verbatim. It looks like clutter and it is
 * not: every alias here is a header a real seller actually typed, accumulated
 * over years of imports failing. "Name" and "Recipient Name" both mean the
 * recipient; dropping either breaks somebody's saved template.
 *
 * Unmapped headers pass through unchanged and are simply ignored by the zod
 * schema, so an extra row in someone's sheet is harmless.
 */
export const COLUMN_ALIASES: Record<string, string> = {
  "Order ID": "externalId",
  "Order Id": "externalId",
  "order_id": "externalId",
  "Order Date": "placedAt",
  "Quantity": "quantity",
  "Qty": "quantity",
  "Product": "variant",
  "Product Key": "variant",
  "Variation": "product",
  "Variant": "product",
  "Variant Key": "product",
  "SKU": "sku",
  "Order SKU": "sku",
  "Marketplace": "marketplace",
  "Email": "shippingEmail",
  "Name": "shippingName",
  "Recipient Name": "shippingName",
  "Phone": "shippingPhone",
  "Address": "line1",
  "Address Line 2": "line2",
  "City": "city",
  "State": "state",
  "Zipcode": "zip",
  "Zip": "zip",
  "Postcode": "zip",
  "Country": "country",
  "Note": "note",
  "Warehouse Note": "internalNote",
};

/** The template we hand out. Order matters — it is what people fill in. */
export const TEMPLATE_HEADERS = [
  "Order ID",
  "Marketplace",
  "SKU",
  "Quantity",
  "Recipient Name",
  "Email",
  "Phone",
  "Address",
  "Address Line 2",
  "City",
  "State",
  "Zipcode",
  "Country",
  "Note",
];

/**
 * The columns the import dialog previews before committing.
 *
 * `header` is the TEMPLATE's own text, verbatim from TEMPLATE_HEADERS, and is
 * deliberately not translated: the preview's job is to show the operator their
 * own spreadsheet back, and the file they downloaded and filled in says
 * "Recipient Name", not "Destinataire". `field` is the parsed name that
 * COLUMN_ALIASES maps that header onto.
 */
export const PREVIEW_COLUMNS: {
  header: string;
  field: string;
  /** IBM Plex Mono — machine truth only: ids, SKUs and counts. */
  mono: boolean;
  /** Right-aligned, because a column of figures reads down its units. */
  numeric?: boolean;
}[] = [
  { header: "Order ID", field: "externalId", mono: true },
  { header: "Marketplace", field: "marketplace", mono: false },
  { header: "SKU", field: "sku", mono: true },
  { header: "Quantity", field: "quantity", mono: true, numeric: true },
  { header: "Recipient Name", field: "shippingName", mono: false },
];

/**
 * Minimal RFC-4180 CSV: quoted fields, embedded commas, doubled quotes, and
 * CRLF. Hand-written rather than pulled from a package — this is the whole
 * grammar, and it is smaller than the argument for a dependency.
 *
 * Deliberately NOT .xlsx: the only npm build of SheetJS is 0.18.5, which
 * predates the fixes for its prototype-pollution and ReDoS advisories, and
 * this parses files strangers upload. See the commit for the decision.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let column: string[] = [];
  let field = "";
  let quoted = false;

  // Strip a UTF-8 BOM — Excel writes one and it would otherwise become part of
  // the first header, so "Order ID" would not match its alias.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      column.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      column.push(field);
      field = "";
      // Skip blank lines rather than emitting an all-empty column that would
      // then fail validation and be reported as a broken order.
      if (column.some((v) => v.trim() !== "")) rows.push(column);
      column = [];
    } else field += c;
  }
  column.push(field);
  if (column.some((v) => v.trim() !== "")) rows.push(column);
  return rows;
}
