/**
 * The app's ONE money formatter.
 *
 * Currency used to be `"USD"` written out in seven separate `Intl.NumberFormat`
 * calls, with a further fourteen places printing a hand-typed `$` in front of a
 * raw decimal string. Changing currency meant finding all twenty-one, and the
 * hand-typed ones were invisible to a grep for "USD". They now all come here,
 * so the currency is one line.
 *
 * USD, because the official price list quotes USD: a Glass Suncatcher is $4.03.
 * `Intl` supplies the two decimal places on its own — do not add
 * `minimumFractionDigits` to force them, and do not strip them, or the number
 * on screen stops matching the number the price list agreed.
 *
 * This was VND for one release, while the catalogue was a Vietnamese production
 * cost sheet. Changing it back is this one line PLUS a reimport: prices are
 * stored verbatim, so the digits in the database are in whatever currency the
 * workbook that wrote them used. The two have to move together.
 *
 * LOCALE is deliberately the viewer's (`undefined`), matching how every date in
 * the app is already formatted with `toLocaleDateString()`. The currency is the
 * business's; the way it is written is the reader's.
 *
 * Values arrive as STRINGS from the server — Prisma Decimal never crosses the
 * boundary as a float, because a float loses money. This accepts both and does
 * the one conversion, at the edge, where the value is about to be read rather
 * than calculated with.
 */
export const CURRENCY = "USD";

const formatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: CURRENCY,
});

/**
 * Format a money value for display.
 *
 * `null` / `undefined` / an unparseable string render as an em dash rather than
 * "NaN ₫" — a missing price is a fact worth showing, and every call site was
 * already branching to "—" by hand.
 */
export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? formatter.format(n) : "—";
}

/**
 * Format the magnitude, dropping the sign — for the columns that show direction
 * with a "+"/"−" of their own, or with colour, and would otherwise print the
 * minus twice.
 */
export function moneyAbs(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? formatter.format(Math.abs(n)) : "—";
}
