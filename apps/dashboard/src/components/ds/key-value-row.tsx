import { cn } from "@/lib/utils";

/**
 * A label/value pair in a detail panel — ported from the design system's
 * `components/data/KeyValueRow`.
 *
 * `mono` is not decoration: per DS rule 4, order IDs, SKUs, tracking numbers
 * and money are set in IBM Plex Mono. Pass it for those and nothing else.
 */
export type KeyValueRowProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
};

export function KeyValueRow({ label, value, mono = false, className }: KeyValueRowProps) {
  return (
    <div
      data-slot="key-value-row"
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-(--border-hairline) py-2.5 last:border-b-0",
        className
      )}
    >
      <dt className="font-sans text-(length:--fs-body-sm) text-(--text-label)">{label}</dt>
      <dd
        className={cn(
          "text-right text-(length:--fs-body) font-semibold text-(--text-body)",
          mono ? "font-mono tracking-(--ls-mono)" : "font-sans"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
