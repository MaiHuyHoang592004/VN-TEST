/**
 * Reads the official OP Creative price list workbook.
 *
 * ONE PLACE understands this file's shape, because two scripts need the same
 * answer and they must not drift: the importer writes products keyed by slug,
 * and the image extractor writes `<slug>.webp` files those products point at.
 * A slug computed twice is a slug that eventually disagrees with itself.
 *
 * SHAPE. The workbook is a printed price list, not a data export, so it is laid
 * out for a human reader:
 *
 *   col A  product name  — set ONCE, on the product's first row
 *   col B  photo         — an embedded image, not a cell value (see the
 *                          extractor; drawing anchors carry the row)
 *   col C  mockup link   col D  material   col E  description
 *   col F  size          col G  product cost   col H/I  shipping first/add-on
 *   col J  total including shipping
 *
 * A row with a name STARTS a product; the rows under it are its sizes. So a
 * product is a run of rows, and a size row is blank in column A. Every reader
 * has to reconstruct that grouping, which is exactly why it lives here.
 *
 * The trailing "Các size to hơn liên hệ hotline support" row is prose in the
 * size column, not a size, and is dropped.
 */
import XLSX from "xlsx-js-style";

/** Sheets to read, in catalogue order, with the drawing part holding each
 * sheet's photos. The workbook has exactly these two and no others. */
export const SHEETS = [
  { name: "PRICE LIST", drawing: "drawing1" },
  { name: "ORNAMENT", drawing: "drawing2" },
] as const;

export type Size = {
  size: string;
  /** Column G. The price a seller pays; shipping is quoted separately. */
  cost: number | null;
  shipFirst: number | null;
  shipAddOn: number | null;
  totalWithShipping: number | null;
};

export type Product = {
  sheet: string;
  /** The raw column-A text, kept verbatim for display. */
  name: string;
  /** Stable machine key — also the image filename. */
  key: string;
  material: string;
  description: string;
  mockupUrl: string;
  /** 0-based row in the RAW sheet, so photo anchors can be matched to it. */
  row: number;
  sizes: Size[];
};

/**
 * URL- and filename-safe key.
 *
 * Vietnamese names go through NFD so the diacritics separate from their letters
 * and drop out as combining marks; "đ" carries no combining mark and needs its
 * own rule. Without this, "Dây Ornament trang trí" collapses to "d-y-ornament-
 * trang-tr" — the shape of the earlier import that produced the unreadable key
 * `b-ng-g-kh-c-t-n`.
 */
export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** SKU codes get read aloud on a warehouse floor, so they lose punctuation:
 * "Cir7.8in" becomes CIR78IN, `6"x5.5"` becomes 6X55. */
export const skuPart = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Initials of a product name, for the SKU prefix. Punctuation is stripped
 * FIRST, or "GLASS ORNAMENT ( CRICLE)" contributes "(" as a word initial and
 * two ornament products end up with the same unreadable prefix. */
export const abbrev = (name: string) => {
  const words = name.replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join("").toUpperCase();
  return (initials.length >= 3 ? initials : name.replace(/[^A-Za-z0-9]/g, "").toUpperCase()).slice(0, 4);
};

const num = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const text = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * Read the workbook ONCE, keeping the raw zip entries.
 *
 * `bookFiles` is what makes the photos reachable: without it SheetJS parses the
 * sheets and throws the package away, and the images — which are parts inside
 * the .xlsx zip, not cell values — become unreadable without a second parse of
 * a 45 MB file by a second library.
 */
export function readWorkbook(file: string): XLSX.WorkBook {
  return XLSX.readFile(file, { bookFiles: true });
}

/** The raw bytes of one part inside the .xlsx package. */
export function part(wb: XLSX.WorkBook, path: string): Buffer {
  const entry = (wb as unknown as { files?: Record<string, { content: Buffer }> }).files?.[path];
  if (!entry) throw new Error(`Missing ${path} in the workbook — was it read with bookFiles?`);
  return Buffer.from(entry.content);
}

export function readPriceList(file: string): Product[] {
  return parsePriceList(readWorkbook(file));
}

export function parsePriceList(wb: XLSX.WorkBook): Product[] {
  const products: Product[] = [];

  for (const { name: sheetName } of SHEETS) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) throw new Error(`No "${sheetName}" sheet. Found: ${wb.SheetNames.join(", ")}`);

    // blankrows kept: row indices must line up with the photo anchors, which
    // count every row in the file including the empty ones.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: true,
    });

    let current: Product | null = null;
    // Rows 1-3 are the hotline banner and the two-deep column header.
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const title = text(r[0]);
      if (title) {
        current = {
          sheet: sheetName,
          name: title,
          key: slug(title),
          material: text(r[3]),
          description: text(r[4]),
          mockupUrl: text(r[2]),
          row: i,
          sizes: [],
        };
        products.push(current);
      }
      const size = text(r[5]);
      if (!current || !size || /liên hệ hotline/i.test(size)) continue;
      current.sizes.push({
        size,
        cost: num(r[6]),
        shipFirst: num(r[7]),
        shipAddOn: num(r[8]),
        totalWithShipping: num(r[9]),
      });
    }
  }

  const keys = new Set<string>();
  for (const p of products) {
    if (keys.has(p.key)) throw new Error(`Duplicate product key "${p.key}" (${p.name})`);
    keys.add(p.key);
  }
  return products;
}
