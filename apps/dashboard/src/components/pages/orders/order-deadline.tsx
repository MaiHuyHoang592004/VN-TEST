"use client";

import { useSyncExternalStore } from "react";

import { StatusBadge, type StatusTone } from "@/components/ds";
import { TERMINAL } from "@/modules/fulfillment/orders/status";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * How much time an order has left, as the floor reads it.
 *
 * `deadline` has been fetched, typed and carried to the browser since the
 * column set was written and rendered nowhere — dead payload on the one signal
 * a fulfillment platform is actually run by. A raw date does not answer the
 * question people are asking of it ("is this one late?"), so the cell reads
 * RELATIVELY and the absolute date lives in `title=` for whoever needs to be
 * precise.
 *
 * THE HORIZON IS NOT INVENTED HERE. docs/design-system/DOMAIN_RESOLVED.md §9
 * fixes `SHIPMENT_OVERDUE_DAYS = 7` — the one overdue horizon the domain has
 * ruled on (a pre-transit/in-transit shipment past 7 days is a tracking alert).
 * Rather than pick a second, different number for "due soon", this reuses it:
 * inside a week is worth colour, beyond a week is not yet news.
 */
const OVERDUE_HORIZON_DAYS = 7;

const DAY_MS = 86_400_000;

export type DeadlineSeverity = "overdue" | "due" | "ahead";

/**
 * Severity → the design system's tone vocabulary, never to a colour.
 *
 * A deadline is not a status: `toneFor()` has never seen one and would answer
 * `neutral` for all three, which is the "correct-but-useless" grey the tone map
 * warns about. This is the same escape hatch status-tones.ts sanctions for
 * TicketPriority — a local map of TONE NAMES, resolved to real colour by
 * StatusBadge's own token classes. No hex, no ternary, no second palette.
 *
 * All three severities are mapped even though `ahead` currently renders as
 * plain text: the mapping is the complete statement of what each severity
 * MEANS, so if a later design does want a pill on a comfortable deadline the
 * tone has already been ruled on rather than picked on the spot.
 */
const DEADLINE_TONES: Record<DeadlineSeverity, StatusTone> = {
  overdue: "critical",
  due: "attention",
  ahead: "neutral",
};

/**
 * Today, as a UTC day index.
 *
 * UTC on BOTH sides of the subtraction, deliberately. This column
 * server-renders and then hydrates, and a day count taken from the local
 * calendar is off by one for anyone whose local date differs from the server's
 * at that moment — a hydration mismatch on the row's most important word ("Due
 * today" versus "Due tomorrow"). A UTC day index is the same integer in both
 * places, and the deadline is stored as an instant anyway.
 *
 * Read through useSyncExternalStore rather than by calling Date.now() in the
 * body: the clock is an external mutable source, and reading one during render
 * is exactly the impurity React's rules forbid. `subscribe` never fires because
 * nothing here should force a re-render at midnight — this is a server-driven
 * table, and the next render (a page turn, a filter, a router.refresh) picks up
 * the new day on its own.
 */
const todayUtc = () => Math.floor(Date.now() / DAY_MS);
const subscribeToNothing = () => () => {};

function useTodayUtc(): number {
  return useSyncExternalStore(subscribeToNothing, todayUtc, todayUtc);
}

/** Whole days from `today` to the deadline. */
function daysUntil(iso: string, today: number): number {
  const due = Date.parse(iso);
  if (Number.isNaN(due)) return Number.NaN;
  return Math.floor(due / DAY_MS) - today;
}

function severityOf(days: number): DeadlineSeverity {
  if (days < 0) return "overdue";
  return days <= OVERDUE_HORIZON_DAYS ? "due" : "ahead";
}

/**
 * The relative phrase. Singular and plural are separate KEYS rather than one
 * string with a bracketed "(s)": this file's interpolation is the codebase's
 * plain `.replace("{count}", …)`, and the six locales that translate from here
 * need somewhere to put a form English does not have.
 */
function labelKey(days: number): { key: string; count: number } {
  if (days < -1) return { key: "orders.deadline.overdue", count: -days };
  if (days === -1) return { key: "orders.deadline.overdueOne", count: 1 };
  if (days === 0) return { key: "orders.deadline.dueToday", count: 0 };
  if (days === 1) return { key: "orders.deadline.dueTomorrow", count: 1 };
  return { key: "orders.deadline.dueInDays", count: days };
}

export function OrderDeadline({
  deadline,
  status,
  className,
}: {
  deadline: string | null;
  /** Read only to decide whether "late" is still a live fact. */
  status: string;
  className?: string;
}) {
  const { t } = useTranslation();
  // Before the early return: a hook cannot sit behind a branch.
  const today = useTodayUtc();

  // The same em-dash every other column uses for "nothing here", with the
  // reason in the tooltip so it is not confused with a value that failed to
  // load.
  if (!deadline) {
    return (
      <span
        title={t("orders.deadline.none")}
        className={cn("text-(length:--fs-body-sm) text-(--text-muted)", className)}
      >
        —
      </span>
    );
  }

  const days = daysUntil(deadline, today);
  if (Number.isNaN(days)) {
    return (
      <span className={cn("text-(length:--fs-body-sm) text-(--text-muted)", className)}>—</span>
    );
  }

  const { key, count } = labelKey(days);
  const label = t(key).replace("{count}", count.toLocaleString());
  const absolute = t("orders.deadline.due").replace(
    "{date}",
    new Date(deadline).toLocaleDateString(),
  );

  // A DELIVERED, CANCELLED or REFUNDED order cannot become less late, and
  // nobody can act on it. Painting a red pill on every settled row would spend
  // the one colour that means "go and do something" on history, and drown the
  // handful of rows that do need doing. The phrase stays — it is still a true
  // fact about the order — it simply stops shouting.
  const settled = (TERMINAL as readonly string[]).includes(status);
  const severity = severityOf(days);

  // Beyond a week out there is nothing to flag, so the cell is plain text. That
  // absence IS the at-a-glance signal: colour in this column always means the
  // clock is running out, never "here is a date".
  if (settled || severity === "ahead") {
    return (
      <span
        title={absolute}
        className={cn("text-(length:--fs-body-sm) text-(--text-muted)", className)}
      >
        {label}
      </span>
    );
  }

  return (
    <span title={absolute} className={cn("inline-flex", className)}>
      <StatusBadge status={severity} tone={DEADLINE_TONES[severity]} size="sm">
        {label}
      </StatusBadge>
    </span>
  );
}
