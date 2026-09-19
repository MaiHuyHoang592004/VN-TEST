/**
 * Money is an integer count of the currency's minor units, carried together
 * with its currency code. Never a float, never a bare number.
 *
 * Floats cannot represent 0.1, so any system that adds prices as floats is
 * one long enough invoice away from being a cent out. A decimal type fixes
 * that but invites mixing two numeric representations across the wire, the
 * database and the UI. An integer of minor units is exact, JSON-safe, and the
 * unit ambiguity ("is 5 five dollars or five cents?") is removed by never
 * naming a money field without the `Minor` suffix.
 */

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: string;
}

export function money(amountMinor: bigint | number, currency: string): Money {
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`amountMinor must be a safe integer, received ${amountMinor}`);
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError(`currency must be an ISO 4217 alpha-3 code, received "${currency}"`);
  }
  return { amountMinor: BigInt(amountMinor), currency };
}

/** Adding two amounts in different currencies is a bug, not a conversion. */
export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

/** Quantity is a count, so this is exact — no rounding decision to get wrong. */
export function multiply(a: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError(`quantity must be an integer, received ${quantity}`);
  }
  return { amountMinor: a.amountMinor * BigInt(quantity), currency: a.currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`currency mismatch: ${a.currency} and ${b.currency}`);
  }
}

/** Display only. Never feed the result back into arithmetic. */
export function format(m: Money, locale = "en-US", minorUnitDigits = 2): string {
  const divisor = 10 ** minorUnitDigits;
  const asNumber = Number(m.amountMinor) / divisor;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: minorUnitDigits,
  }).format(asNumber);
}
