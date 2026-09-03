"use client";

import { useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { attachProofAction } from "@/modules/fulfillment/stations/actions";

import type { StationGroup } from "./station";

/**
 * Uploading the proof photo, wherever it came from — the rear camera on a
 * phone, a webcam over the bench, or a file.
 *
 * A hook rather than two copies, because the OVERWRITE GATE is the part worth
 * getting right once: the server refuses to replace the evidence on a parcel
 * that is already fulfilled or shipped until a human says so, and both entry
 * points have to ask that question the same way.
 */
export function useProofUpload(
  /** Null while the station holds nothing — the camera panel mounts before the
   * first scan, and "photograph what exactly?" has no answer yet. */
  group: StationGroup | null,
  onGroup: (group: StationGroup) => void,
) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<File | null>(null);

  const send = async (file: File, overwrite: boolean) => {
    if (!group) return;
    const form = new FormData();
    form.set("file", file);
    if (group.trackingNumber) form.set("trackingNumber", group.trackingNumber);
    else form.set("orderId", String(group.orders[0].id));
    if (overwrite) form.set("overwrite", "true");

    setPending(true);
    const result = await attachProofAction(form);
    setPending(false);

    if ("error" in result) {
      toast.error(t(`fulfillment.errors.${result.error}`));
      return;
    }
    if (result.requiresOverwrite) {
      setConfirming(file);
      return;
    }
    if (result.group) {
      onGroup(result.group);
      toast.success(t("fulfillment.proof.saved"));
    }
  };

  const overwritePrompt = confirming ? (
    <FormDialog
      open
      onOpenChange={(open) => !open && setConfirming(null)}
      title={t("fulfillment.proof.overwriteTitle")}
      description={t("fulfillment.proof.overwriteDesc")}
      submitLabel={t("fulfillment.proof.overwriteSubmit")}
      destructive
      pending={pending}
      onSubmit={() => {
        const file = confirming;
        setConfirming(null);
        if (file) void send(file, true);
      }}
    >
      <p className="text-muted-foreground text-sm">{t("fulfillment.proof.overwriteBody")}</p>
    </FormDialog>
  ) : null;

  return { upload: (file: File) => send(file, false), overwritePrompt, pending };
}
