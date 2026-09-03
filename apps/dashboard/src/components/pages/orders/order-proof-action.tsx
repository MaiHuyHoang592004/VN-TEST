"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { attachProofAction } from "@/modules/fulfillment/stations/actions";

/**
 * Upload a proof photo for one order from the table.
 *
 * The same action, gate and overwrite rules as the station — this is the
 * office's way in for the parcel nobody photographed at the bench, not a
 * second implementation. It resolves by ORDER ID rather than tracking number
 * so it works on an order with no shipment yet, and the service still widens
 * to the whole parcel: photographing one piece of a box photographs the box.
 */
export function OrderProofAction({
  orderId,
  hasProof,
}: {
  orderId: number;
  hasProof: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<File | null>(null);

  const send = async (file: File, overwrite: boolean) => {
    const form = new FormData();
    form.set("file", file);
    form.set("orderId", String(orderId));
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
    toast.success(t("fulfillment.proof.saved"));
    router.refresh();
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await send(file, false);
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-label={t(hasProof ? "orders.proof.replace" : "orders.proof.upload")}
        title={t(hasProof ? "orders.proof.replace" : "orders.proof.upload")}
        onClick={() => fileRef.current?.click()}
      >
        <Camera className={`size-4 ${hasProof ? "stroke-vercel-green" : ""}`} />
      </Button>

      {confirming && (
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
      )}
    </>
  );
}
