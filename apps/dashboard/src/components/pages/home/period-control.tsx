"use client";

import { useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useLocaleRouter } from "@/lib/i18n/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n";
import { TIME_PERIODS, type TimePeriod } from "@/lib/time-period";

/**
 * Today / This week / This month / This year / All / custom — the legacy
 * segmented control, kept because it is the vocabulary the team already uses.
 *
 * It writes to the URL and lets the server re-render: the numbers are computed
 * where the data is, and a chosen window can be shared as a link.
 *
 * The buttons are FILTERS, not navigation, so the selected one carries
 * `aria-pressed` — the variant swap is colour, and colour alone is not a state.
 *
 * The push runs in a transition and the strip dims while the server re-renders:
 * every one of these buttons re-renders the whole page, and without a pending
 * signal a slow period reads as a dead click.
 *
 * The destination comes from usePathname(), not a literal "/": the control is
 * mounted by the home page today, but a hardcoded path is how a control
 * silently navigates away from the page it is sitting on.
 */
export function PeriodControl({ period }: { period: TimePeriod }) {
  const router = useLocaleRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  return (
    // Dimmed, not disabled: disabling the button the pointer is on would drop
    // focus to <body> in the middle of the interaction.
    <div
      aria-busy={pending}
      data-pending={pending ? "" : undefined}
      className="flex flex-wrap items-center gap-2 transition-opacity duration-(--dur-fast) data-pending:opacity-60 motion-reduce:transition-none"
    >
      <div className="border-border flex flex-wrap gap-1 rounded-md border p-1">
        {TIME_PERIODS.filter((p) => p !== "custom").map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period === p ? "secondary" : "ghost"}
            aria-pressed={period === p}
            onClick={() => setParams({ period: p, from: "", to: "" })}
          >
            {t(`home.periods.${p}`)}
          </Button>
        ))}
      </div>

      {/* Native date inputs: the platform ships the picker, the keyboard
          support and the locale format. */}
      <Input
        type="date"
        aria-label={t("home.from")}
        className="w-36"
        value={params.get("from") ?? ""}
        onChange={(e) => setParams({ period: "custom", from: e.target.value })}
      />
      <Input
        type="date"
        aria-label={t("home.to")}
        className="w-36"
        value={params.get("to") ?? ""}
        onChange={(e) => setParams({ period: "custom", to: e.target.value })}
      />
    </div>
  );
}
