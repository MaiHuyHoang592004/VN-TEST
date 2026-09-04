"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { voidLabelAction } from "@/modules/fulfillment/labels/actions";

/**
 * Cancel a bought label.
 *
 * Deliberately does not mention a refund anywhere: voiding is a shipping-
 * record change, never a balance one. If the carrier confirms the void
 * (`carrierVoided`), the success toast says so; if it does not — no `void`
 * on the provider, or the carrier call failed — the toast says that too, so
 * an operator knows whether they still need to call the carrier directly.
 */
export function VoidLabelDialog({
  shipmentId,
  trackingNumber,
  open,
  onOpenChange,
}: {
  shipmentId: number;
  trackingNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  const { submit, pending, formError } = useFormAction({
    action: async () => {
      const result = await voidLabelAction(shipmentId, reason);
      if (result.ok) {
        toast.success(
          result.carrierVoided
            ? t("orders.labels.voidDoneCarrier")
            : t("orders.labels.voidDoneLocalOnly"),
        );
      }
      return result;
    },
    errorMessages: {
      "already-voided": t("orders.labels.voidErrAlready"),
      "no-label": t("orders.labels.voidErrNoLabel"),
      "reason-required": t("orders.labels.voidErrReason"),
      "not-found": t("orders.labels.voidErrNotFound"),
    },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("orders.labels.voidTitle")}
      description={
        trackingNumber
          ? t("orders.labels.voidDesc").replace("{tracking}", trackingNumber)
          : t("orders.labels.voidDescNoTracking")
      }
      submitLabel={t("orders.labels.voidSubmit")}
      destructive
      pending={pending}
      submitDisabled={!reason.trim()}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      <FormField label={t("orders.labels.voidReason")} required>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("orders.labels.voidReasonPlaceholder")}
          />
        )}
      </FormField>
    </FormDialog>
  );
}

