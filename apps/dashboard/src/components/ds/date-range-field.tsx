"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The date-range control — ported from the design system's
 * `components/forms/DateRangeField`.
 *
 * The prop shape deliberately mirrors how the pages already carry dates: the
 * Orders page reads `from`/`to` out of searchParams and hands them to a query.
 * Adopting this component therefore needs no change to any handler or query
 * (rules 1, 7).
 *
 * It holds no URL state and no default range: a component that quietly
 * defaults to "last 30 days" makes every page that mounts it lie about what it
 * is showing.
 */
export type DateRangeFieldProps = {
  from?: Date;
  to?: Date;
  onChange: (range: { from?: Date; to?: Date }) => void;
  label?: React.ReactNode;
  className?: string;
};

export function DateRangeField({
  from,
  to,
  onChange,
  label,
  className,
}: DateRangeFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  /**
   * The default label, the two buttons and the fallback accessible name were
   * hardcoded English, which quietly made this component unusable on a
   * Vietnamese screen — the one language most of the operational users read.
   *
   * Resolved here rather than in the parameter default because `t()` is a hook
   * result and a default value is evaluated before the hook runs. The prop
   * contract is unchanged: `label` is still an optional ReactNode, and a caller
   * that passes one still wins.
   */
  const resolvedLabel = label ?? t("common.dateRange");

  const summary =
    from && to
      ? `${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")}`
      : from
        ? `${format(from, "d MMM yyyy")} –`
        : to
          ? `– ${format(to, "d MMM yyyy")}`
          : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            shape="rounded"
            aria-label={
              typeof resolvedLabel === "string" ? resolvedLabel : t("common.dateRange")
            }
            className={cn("justify-start gap-2 font-normal", className)}
          >
            <CalendarDays className="size-4" />
            {summary ? (
              <span className="font-mono text-(length:--fs-body-sm)">{summary}</span>
            ) : (
              <span className="text-(--text-muted)">{resolvedLabel}</span>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="range"
          selected={{ from, to }}
          onSelect={(range) => onChange({ from: range?.from, to: range?.to })}
          numberOfMonths={2}
        />
        <div className="mt-2 flex justify-end gap-2 border-t border-(--border-hairline) pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ from: undefined, to: undefined });
              setOpen(false);
            }}
          >
            {t("common.clear")}
          </Button>
          <Button variant="default" size="sm" onClick={() => setOpen(false)}>
            {t("common.done")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
