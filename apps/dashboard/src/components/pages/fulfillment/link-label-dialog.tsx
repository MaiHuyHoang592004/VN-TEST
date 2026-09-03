"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { linkLabelAction } from "@/modules/fulfillment/stations/actions";

import type { StationGroup } from "./station";

/**
 * Attach a label bought elsewhere to every piece of the parcel.
 *
 * Behind orders.labels.manage, not the station's own permission: a label costs
 * money with a carrier, and advancing an order does not. Phase C adds buying
 * one through a provider; this is the manual path, and it writes the same
 * Shipment rows.
 */
export function LinkLabelDialog({
  group,
  onClose,
  onLinked,
}: {
  group: StationGroup;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { t } = useTranslation();
  const [trackingNumber, setTrackingNumber] = useState(group.trackingNumber ?? "");
  const [labelUrl, setLabelUrl] = useState("");
  const [provider, setProvider] = useState("");
  const [method, setMethod] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    const result = await linkLabelAction({
      orderIds: group.orders.map((o) => o.id),
      trackingNumber: trackingNumber.trim(),
      labelUrl: labelUrl.trim(),
      provider: provider.trim() || undefined,
      method: method.trim() || undefined,
    });
    setPending(false);

    if ("error" in result && result.error) {
      setError(
        result.error === "validation"
          ? Object.values(result.fieldErrors ?? {})[0] ?? t("fulfillment.errors.validation")
          : t(`fulfillment.errors.${result.error}`),
      );
      return;
    }
    toast.success(
      t("fulfillment.label.linked").replace("{count}", String(group.orders.length)),
    );
    onLinked();
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("fulfillment.label.title")}
      description={t("fulfillment.label.desc").replace("{count}", String(group.orders.length))}
      submitLabel={t("fulfillment.label.submit")}
      pending={pending}
      submitDisabled={!trackingNumber.trim() || !labelUrl.trim()}
      formError={error}
      onSubmit={submit}
    >
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("fulfillment.label.tracking")}</span>
        <Input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          autoFocus
          className="font-mono"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("fulfillment.label.url")}</span>
        <Input
          value={labelUrl}
          onChange={(e) => setLabelUrl(e.target.value)}
          type="url"
          placeholder="https://"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("fulfillment.label.provider")}</span>
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("fulfillment.label.method")}</span>
          <Input value={method} onChange={(e) => setMethod(e.target.value)} />
        </label>
      </div>
    </FormDialog>
  );
}
