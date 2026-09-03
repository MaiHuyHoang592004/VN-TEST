"use client";

import { Badge } from "@/components/ui/badge";
import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";

import type { StationGroup } from "./station";

/**
 * "Someone has already worked this parcel."
 *
 * Shown when any piece was past ASSIGNED before this scan — computed by the
 * service BEFORE it moved anything, so the flags describe the parcel as the
 * operator found it, not as the scan left it. Two people packing the same box
 * is the mistake this catches, and it is expensive: one of them is packing
 * something that has already shipped.
 */
export function AlreadyScannedDialog({
  group,
  onContinue,
  onCancel,
}: {
  group: StationGroup;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const scanned = group.orders.filter((o) => o.wasScanned);

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title={t("fulfillment.scanned.title")}
      description={t("fulfillment.scanned.desc").replace("{count}", String(scanned.length))}
      submitLabel={t("fulfillment.scanned.continue")}
      onSubmit={onContinue}
    >
      <ul className="divide-border border-border max-h-64 divide-y overflow-y-auto rounded-md border">
        {scanned.map((o) => (
          <li
            key={o.id}
            // Amber for anything already in flight; a PENDING column here is
            // merely unusual, the later ones are the ones to look at.
            className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
              o.status !== "PENDING" ? "bg-vercel-yellow/5" : ""
            }`}
          >
            <span className="truncate font-mono text-xs">{o.externalId ?? `#${o.id}`}</span>
            <Badge product="secondary">{t(`orders.statuses.${o.status}`)}</Badge>
          </li>
        ))}
      </ul>
    </FormDialog>
  );
}
