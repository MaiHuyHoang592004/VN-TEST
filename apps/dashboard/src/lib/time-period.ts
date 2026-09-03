/**
 * The dashboard's time window, resolved on the SERVER from the URL.
 *
 * A search param rather than client state, so a link to "this month" is a link
 * anyone can send, the back button works, and the numbers are rendered once
 * instead of fetched again after hydration. The legacy segmented control is
 * kept as-is because it is the vocabulary the team already uses.
 */
export const TIME_PERIODS = ["today", "week", "month", "year", "all", "custom"] as const;
export type TimePeriod = (typeof TIME_PERIODS)[number];

export type ResolvedPeriod = {
  period: TimePeriod;
  from?: Date;
  to?: Date;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/**
 * `now` is a parameter, not `new Date()` inside: a function that reads the
 * clock cannot be tested, and this one decides which orders count.
 */
export function resolvePeriod(
  raw: { period?: string; from?: string; to?: string },
  now = new Date(),
): ResolvedPeriod {
  const period = (TIME_PERIODS as readonly string[]).includes(raw.period ?? "")
    ? (raw.period as TimePeriod)
    : "month";

  if (period === "all") return { period };

  if (period === "custom") {
    const from = raw.from ? startOfDay(new Date(raw.from)) : undefined;
    const to = raw.to ? endOfDay(new Date(raw.to)) : undefined;
    // A custom range with neither end is just "all time" wearing a hat.
    if (!from && !to) return { period: "all" };
    return { period, from, to };
  }

  const to = endOfDay(now);
  if (period === "today") return { period, from: startOfDay(now), to };
  if (period === "week") {
    // Monday-first: the week a production floor plans in.
    const day = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    return { period, from: monday, to };
  }
  if (period === "year") return { period, from: new Date(now.getFullYear(), 0, 1), to };
  return { period: "month", from: new Date(now.getFullYear(), now.getMonth(), 1), to };
}
