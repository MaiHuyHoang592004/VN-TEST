"use client";

import { AlertTriangle } from "lucide-react";

import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { CONFIRM_THRESHOLD } from "@/modules/fulfillment/stations/service/errors";

/**
 * The gate in front of a very large scan.
 *
 * A search matching hundreds of orders is a typo far more often than it is a
 * real parcel, and the service has deliberately mutated nothing yet — this
 * dialog is what turns the operator's intent into the second call. Cancelling
 * is genuinely free, and the copy says so, because a warning that might have
 * already done the thing is a warning people learn to click through.
 */
export function ConfirmScanDialog({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title={t("fulfillment.scan.confirmTitle")}
      description={t("fulfillment.scan.confirmDesc")
        .replace("{count}", String(count))
        .replace("{threshold}", String(CONFIRM_THRESHOLD))}
      submitLabel={t("fulfillment.scan.confirmSubmit")}
      onSubmit={onConfirm}
    >
      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <AlertTriangle className="stroke-vercel-yellow mt-0.5 size-4 shrink-0" />
        {t("fulfillment.scan.confirmBody")}
      </p>
    </FormDialog>
  );
}
