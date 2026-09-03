"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { completeHandoffAction } from "@/modules/fulfillment/stations/actions";

import type { StationGroup } from "./station";

/**
 * The last thing anyone does to the box.
 *
 * The operator types the word "completed". That is not theatre and not a
 * confirm() in disguise: legacy's floor asked for the ritual precisely because
 * a one-click Complete was being pressed on parcels that were not packed, and
 * typing a word is the cheapest way to make a person look at what is in front
 * of them one more time.
 */
export function HandoffDialog({
  group,
  onClose,
  onShipped,
}: {
  group: StationGroup;
  onClose: () => void;
  onShipped: (labelUrl: string | null) => void;
}) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  // Only needed when the parcel has no label yet — the handoff still has to
  // record where it went, so the operator supplies what is on the box.
  const [tracking, setTracking] = useState(group.trackingNumber ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    const result = await completeHandoffAction({
      orderId: group.orders[0].id,
      trackingNumber: tracking.trim() || undefined,
      confirmText,
    });
    setPending(false);

    if ("error" in result) {
      setError(
        result.error === "not-ready" && Array.isArray(result.detail)
          ? t("fulfillment.errors.not-ready-detail").replace(
              "{orders}",
              (result.detail as Array<{ externalId: string | null; id: number }>)
                .map((d) => d.externalId ?? `#${d.id}`)
                .join(", "),
            )
          : t(`fulfillment.errors.${result.error}`),
      );
      setConfirmText("");
      return;
    }
    if (result.group) {
      toast.success(t("fulfillment.handoff.done"));
      onShipped(result.labelUrl);
    }
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("fulfillment.handoff.title")}
      description={t("fulfillment.handoff.desc")}
      submitLabel={t("fulfillment.handoff.submit")}
      pending={pending}
      submitDisabled={!confirmText.trim()}
      formError={error}
      onSubmit={submit}
    >
      {!group.trackingNumber && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("fulfillment.handoff.tracking")}</span>
          <Input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder={t("fulfillment.handoff.trackingPlaceholder")}
            className="font-mono"
          />
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("fulfillment.handoff.typeIt")}</span>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label={t("fulfillment.handoff.typeIt")}
        />
      </label>
    </FormDialog>
  );
}
