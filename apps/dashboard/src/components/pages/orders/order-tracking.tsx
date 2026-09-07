"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The tracking number, as something an operator can actually work with.
 *
 * Comparing a 22-digit number against the one printed on a parcel in their hand
 * IS the job, and the column used to `truncate` that number mid-string with no
 * way to copy it. Three things fix that, in the order they get used:
 *
 *   1. the number is never cut — it wraps out of `truncate` and keeps its
 *      whole length, because half a tracking number is worse than none;
 *   2. the last six characters are emphasised, which is the part that differs
 *      between two labels from the same batch;
 *   3. a copy control, and — where we can name the carrier with confidence — a
 *      link to that carrier's own public tracking page.
 */

/**
 * Carrier → its public tracking page.
 *
 * MATCHED ON A SUBSTRING, not on an exact key: `Shipment.provider` is free-form
 * and arrives spelled "usps", "USPS" and "USPS Ground" from three different
 * places (the seeder, the public API, a label broker's response).
 *
 * DELIBERATELY SHORT. Only carriers whose public URL shape is a stable,
 * documented "paste the number in this parameter" are listed. The label brokers
 * this platform actually buys through — kiloships, pirateship — hand out share
 * pages keyed on a token rather than on the tracking number, so there is no URL
 * to build from what the row holds. Guessing one would send an operator to a
 * carrier's "not found" page, which is worse than not offering the link: they
 * fall back to copy-only, which always works.
 */
const CARRIER_TRACKING: { match: RegExp; url: (n: string) => string }[] = [
  {
    match: /usps|united\s*states\s*postal/i,
    url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  },
  { match: /fedex/i, url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
  // Word-bounded so "groups" or a supplier called "Upstate" cannot claim it.
  { match: /\bups\b/i, url: (n) => `https://www.ups.com/track?loc=en_US&tracknum=${n}` },
  {
    match: /\bdhl\b/i,
    url: (n) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${n}`,
  },
];

/**
 * How big the two controls are allowed to be.
 *
 * `"default"` is the table cell: 32px, sized against a dense row of text. On a
 * PHONE the same cell is rendered inside the expanded order card, and 32px and
 * 28px targets sitting 2px apart is below A11Y.md's 44px floor for <768px —
 * `--touch-min` is that floor, and this is the one screen where these controls
 * are the thing a thumb is aiming at. The glyphs stay the same size; only the
 * hit area grows, so the card does not suddenly sprout two large buttons.
 */
export type TrackingControlSize = "default" | "touch";

/** 44px is `--touch-min`; written as the scale step so tailwind-merge can see
 * it conflict with the Button variant's own `size-8`. */
const TOUCH_TARGET: Record<TrackingControlSize, string> = {
  default: "",
  touch: "size-11",
};

export function carrierTrackingUrl(
  carrier: string | null,
  tracking: string | null,
): string | null {
  if (!carrier || !tracking) return null;
  const entry = CARRIER_TRACKING.find((c) => c.match.test(carrier));
  return entry ? entry.url(encodeURIComponent(tracking)) : null;
}

/**
 * Copy the number, and say so.
 *
 * `navigator.clipboard` is absent outside a secure context and throws when the
 * permission is denied — unguarded, the button does nothing and the operator is
 * left guessing whether it worked. Same shape as the order-id copy in
 * order-qr.tsx, on purpose: two copy buttons on one screen that behave
 * differently is its own small bug.
 */
export function CopyTracking({
  tracking,
  size = "default",
  className,
}: {
  tracking: string;
  size?: TrackingControlSize;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(tracking);
    } catch {
      toast.error(t("orders.tracking.copyFailed"));
      return;
    }
    setCopied(true);
    toast.success(t("orders.tracking.copied"));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("orders.tracking.copy")}
      title={t("orders.tracking.copy")}
      onClick={copy}
      className={cn(TOUCH_TARGET[size], className)}
    >
      {copied ? (
        <Check className="size-3.5 stroke-(--status-success-dot)" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}

/**
 * The number itself, with its tail picked out.
 *
 * Six characters: enough that two labels printed minutes apart differ inside
 * the emphasised run, short enough that the emphasis still reads as emphasis.
 * The head keeps the muted ink so the contrast does the work — no second
 * colour, no bold-on-bold.
 */
function TrackingNumber({ tracking }: { tracking: string }) {
  const tail = tracking.length > 6 ? tracking.slice(-6) : tracking;
  const head = tracking.slice(0, tracking.length - tail.length);
  return (
    <span className="font-mono text-(length:--fs-meta) whitespace-nowrap tracking-(--ls-mono)">
      {head && <span className="text-(--text-muted)">{head}</span>}
      <span className="font-semibold text-(--text-body)">{tail}</span>
    </span>
  );
}

export function OrderTrackingCell({
  tracking,
  carrier,
  service,
  trackingStatus,
  size = "default",
}: {
  tracking: string | null;
  carrier: string | null;
  service: string | null;
  trackingStatus: string | null;
  /** `"touch"` on the phone card — see TrackingControlSize. */
  size?: TrackingControlSize;
}) {
  const { t } = useTranslation();

  if (!tracking) {
    return <span className="text-(length:--fs-body-sm) text-(--text-muted)">—</span>;
  }

  const href = carrierTrackingUrl(carrier, tracking);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-0.5">
        <TrackingNumber tracking={tracking} />
        <CopyTracking tracking={tracking} size={size} />
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={t("orders.tracking.track")}
            title={t("orders.tracking.track")}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-(--radius-xs) text-(--icon-muted) transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none",
              TOUCH_TARGET[size],
            )}
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      {/* Who is carrying it, and on what service. Rendered only when the
          shipment actually has them — an order with no label bought yet leaves
          this blank rather than guessing a carrier. */}
      {(carrier || service) && (
        <p className="truncate text-(length:--fs-meta) text-(--text-muted)">
          {[carrier, service].filter(Boolean).join(" · ")}
        </p>
      )}
      {trackingStatus && (
        <p className="truncate text-(length:--fs-meta) text-(--text-muted)">{trackingStatus}</p>
      )}
    </div>
  );
}
