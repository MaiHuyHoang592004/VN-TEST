"use client";

import { useCallback, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { toneFor } from "@/components/ds";
import { orderTimelineAction } from "@/modules/fulfillment/orders/actions";
import { useTranslation } from "@/lib/i18n";

type Entry = { status: string; at: string | null; reached: boolean };

/**
 * The five-milestone strip inside an expanded order row.
 *
 * Numbers come from `orderTimelineAction`, which reads the audit log — so a
 * date under a step is the moment the order actually entered it. A step that
 * is reached but has no recorded moment shows an em dash rather than a guess.
 *
 * Colour comes from `toneFor(status)` like every other status in the app: the
 * dot of a reached step is its own tone, never a local ternary and never a
 * literal. Steps still ahead are navy-100, which is a NON-TEXT token — the
 * labels beside them stay at navy-400, the floor for de-emphasised type.
 */
export function OrderTimeline({ orderId }: { orderId: number }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  /** A fetch that FAILED, as opposed to one still running. Without it the
   * skeleton simply never went away. */
  const [failed, setFailed] = useState(false);
  /** Bumped by Retry to re-run the effect. */
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setFailed(false);
    setEntries(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let live = true;
    orderTimelineAction(orderId)
      .then((rows) => {
        if (live) setEntries(rows as Entry[]);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    // Cleared on unmount so a slow response cannot set state on a row the
    // reader has already collapsed.
    return () => {
      live = false;
    };
  }, [orderId, attempt]);

  if (failed) {
    return (
      <div className="flex items-center gap-3 rounded-(--radius-card) bg-(--surface-data) p-4">
        <p role="alert" className="font-sans text-(length:--fs-body-sm) text-(--status-critical-fg)">
          {t("orders.timeline.failed")}
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-(--radius-xs) font-sans text-(length:--fs-body-sm) font-semibold text-(--action-600) underline underline-offset-2 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none"
        >
          {t("orders.timeline.retry")}
        </button>
      </div>
    );
  }

  if (!entries) {
    return (
      <div className="rounded-(--radius-card) bg-(--surface-data) p-4">
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  // A SENTENCE, not null. Returning null left the expander opening onto an
  // empty padded cell, and a panel that opens empty teaches people to stop
  // pressing expanders — DataTable's own note on renderExpanded.
  if (entries.length === 0) {
    return (
      <div className="rounded-(--radius-card) bg-(--surface-data) p-4">
        <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
          {t("orders.timeline.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-0 overflow-x-auto rounded-(--radius-card) bg-(--surface-data) px-5 py-4">
      {entries.map((entry, i) => {
        const tone = toneFor(entry.status);
        const isCurrent =
          entry.reached && (i === entries.length - 1 || !entries[i + 1].reached);
        return (
          // A step and the bar that LEADS to it are one unit, so the bar takes
          // its colour from the step it arrives at — the same rule that makes a
          // half-finished line read as progress rather than as decoration.
          <div key={entry.status} className="contents">
            {i > 0 && (
              <span
                aria-hidden
                className="mt-[6px] h-[3px] min-w-6 flex-1 rounded-(--radius-pill)"
                style={{
                  background: entry.reached
                    ? `var(--status-${tone}-dot)`
                    : "var(--navy-100)",
                }}
              />
            )}
            <div className="flex min-w-24 flex-1 flex-col items-center gap-1.5">
              <span
                className="size-3.5 rounded-full"
                style={{
                  background: entry.reached
                    ? `var(--status-${tone}-dot)`
                    : "var(--navy-100)",
                  // The ring marks where the order IS, so the eye lands on the
                  // present before it reads the history either side of it.
                  boxShadow: isCurrent
                    ? `0 0 0 4px var(--status-${tone}-bg)`
                    : undefined,
                }}
              />
              <span
                className={
                  entry.reached
                    ? "font-sans text-(length:--fs-micro) font-bold text-navy-700"
                    : "font-sans text-(length:--fs-micro) font-semibold text-navy-400"
                }
              >
                {t(`orders.statuses.${entry.status}`)}
              </span>
              <span
                className={
                  entry.at
                    ? "font-sans text-(length:--fs-micro) text-navy-500"
                    : "font-sans text-(length:--fs-micro) text-navy-400"
                }
              >
                {entry.at
                  ? new Date(entry.at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })
                  : "—"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
