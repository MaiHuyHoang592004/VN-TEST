"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  labelsEnabledAction,
  previewLabelsAction,
  purchaseLabelsAction,
} from "@/modules/fulfillment/labels/actions";
import type { LabelGroupPreview } from "@/modules/fulfillment/labels/purchase";

/**
 * Buy labels for the selected orders — preview first, always.
 *
 * The dialog is the point of the feature. Buying a label spends real money
 * with a carrier and the refund is a support ticket, not an undo, so nothing
 * is purchased until a human has seen how the orders grouped into parcels,
 * which box each will use, and why anything was skipped. Legacy bought labels
 * automatically on order creation and this screen is the answer to that.
 *
 * The button hides itself when no carrier is configured — a control that can
 * only fail is worse than an absent one.
 */
export function BuyLabelsButton({ orderIds, onDone }: { orderIds: number[]; onDone: () => void }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ groups: LabelGroupPreview[]; skippedOrders: number } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    labelsEnabledAction().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // The reset happens where the dialog is OPENED, not here: clearing state
    // synchronously inside an effect is a render-then-correct.
    previewLabelsAction(orderIds).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [open, orderIds]);

  if (!enabled) return null;

  const willBuy = preview?.groups.filter((g) => g.willPurchase) ?? [];
  const skipped = preview?.groups.filter((g) => !g.willPurchase) ?? [];

  const confirm = async () => {
    setPending(true);
    const result = await purchaseLabelsAction(orderIds);
    setPending(false);

    if (!result.ok) {
      toast.error(t(`fulfillment.errors.${result.error}`));
      return;
    }
    const { purchased, skipped: sk, failed } = result;
    toast[failed.length ? "warning" : "success"](
      t("orders.labels.result")
        .replace("{purchased}", String(purchased.length))
        .replace("{skipped}", String(sk.length))
        .replace("{failed}", String(failed.length)),
    );
    setOpen(false);
    onDone();
    router.refresh();
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setPreview(null);
          setOpen(true);
        }}
      >
        <Tag className="size-4" />
        {t("orders.labels.buy")}
      </Button>

      {open && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title={t("orders.labels.previewTitle")}
          description={t("orders.labels.previewDesc")}
          submitLabel={t("orders.labels.confirm").replace("{count}", String(willBuy.length))}
          submitDisabled={!preview || willBuy.length === 0}
          pending={pending}
          onSubmit={confirm}
        >
          {!preview ? (
            <p className="text-muted-foreground text-sm">{t("orders.labels.loading")}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Tile label={t("orders.labels.tileGroups")} value={preview.groups.length} />
                <Tile label={t("orders.labels.tileWillBuy")} value={willBuy.length} />
                <Tile label={t("orders.labels.tileSkipped")} value={skipped.length} />
              </div>

              <ul className="divide-border border-border max-h-72 divide-y overflow-y-auto rounded-md border">
                {preview.groups.map((g) => (
                  <li key={g.key} className="space-y-1 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {g.to ? `${g.to.name} · ${g.to.city} ${g.to.zip}` : t("orders.labels.noAddress")}
                      </span>
                      {g.willPurchase ? (
                        <Badge className="bg-vercel-green/15 text-vercel-green">
                          {t("orders.labels.willBuy")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {t(`orders.labels.skip.${g.skipReason ?? "not-ready"}`)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {g.orders.map((o) => o.externalId ?? `#${o.id}`).join(", ")}
                    </p>
                    {g.parcels[0] && (
                      <p className="text-muted-foreground text-xs">
                        {g.parcels[0].length}×{g.parcels[0].width}×{g.parcels[0].height}
                        {g.parcels[0].distanceUnit} · {g.parcels[0].weight}
                        {g.parcels[0].massUnit}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {/* No prices: the carrier quotes on purchase, and a made-up
                  estimate here would be a number someone budgets against. */}
              <p className="text-muted-foreground text-xs">{t("orders.labels.noPrices")}</p>
            </>
          )}
        </FormDialog>
      )}
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border rounded-md border p-2 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
