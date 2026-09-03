"use client";

import { useState } from "react";
import { ChevronDown, MapPin, Package, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/hooks/use-permissions";

import { OrderQr, orderQrProps } from "./order-qr";
import { OrderProofAction } from "./order-proof-action";
import type { OrderRow } from "./orders-table";

/**
 * One order as a card, for phones.
 *
 * COMPACT BY DEFAULT. A phone screen holds about four of these, and a list you
 * cannot scan at a glance is a list you scroll past — so the card shows only
 * what identifies the order and what state it is in. Everything a packer
 * *does* (the code, the proof photo) sits behind one tap, because it is needed
 * on one order at a time and not while scrolling.
 *
 * The app is going into a Capacitor shell where a phone is the primary
 * surface, not a fallback: this is the layout, not a degraded table.
 */
export function OrderMobileCard({ order }: { order: OrderRow }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const onFloor = can("orders.status.update");
  const complete = order.filled >= order.quantity;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {/* Tapping the artwork opens the same sheet the code button does, on
            its image view — a thumb has even less chance of judging a design
            at 40px than a mouse does at 32. Outside the onFloor gate below,
            because looking at your own order's design is not floor work. */}
        {order.mockupThumbnail || order.imageUrl ? (
          <OrderQr
            {...orderQrProps(order)}
            initialFormat="image"
            trigger={
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={order.mockupThumbnail ?? order.imageUrl ?? ""}
                alt=""
                className="border-border size-10 rounded-md border object-cover"
              />
            }
          />
        ) : (
          <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
            <Package className="size-4" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-medium">
            {order.externalId ?? `#${order.id}`}
          </p>
          <p className="truncate text-sm">{order.productName ?? "—"}</p>
          <p className="text-muted-foreground truncate text-xs">
            {[order.variantName, order.sku].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-base leading-none font-semibold tabular-nums">
            {order.filled > 0 ? `${order.filled}/${order.quantity}` : order.quantity}
          </p>
          <p className="text-muted-foreground mt-1 text-[10px] uppercase">{t("orders.colQty")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant={
            order.status === "CANCELLED" || order.status === "ON_HOLD"
              ? "destructive"
              : order.status === "DELIVERED"
                ? "default"
                : "secondary"
          }
        >
          {t(`orders.statuses.${order.status}`)}
        </Badge>
        {complete && order.filled > 0 && (
          <Badge className="bg-green-600/15 text-green-600">
            {t("fulfillment.card.filled")}
          </Badge>
        )}
        {order.tracking && (
          <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs">
            <Truck className="size-3 shrink-0" />
            <span className="truncate font-mono">{order.tracking.slice(-8)}</span>
          </span>
        )}
        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
          {new Date(order.placedAt).toLocaleDateString()}
        </span>
      </div>

      {onFloor && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground border-border -mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-md border border-dashed px-2 py-1.5 text-xs transition-colors"
              />
            }
          >
            <span>{open ? t("orders.qr.hideDetails") : t("orders.qr.showDetails")}</span>
            <ChevronDown
              className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>

          {/* Rendered only when open: a QR canvas per column would be dozens of
              draws on a list a thumb is already flicking past. */}
          <CollapsibleContent className="pt-2">
            <div className="space-y-2 text-xs">
              {order.shipTo && (
                <p className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {[order.customerName, order.shipTo].filter(Boolean).join(" — ")}
                  </span>
                </p>
              )}
              {order.trackingStatus && (
                <p className="text-muted-foreground">
                  {t("orders.colTracking")}: {order.trackingStatus}
                </p>
              )}
              {order.note && <p className="text-muted-foreground">{order.note}</p>}

              <div className="flex items-center gap-2 pt-1">
                <OrderQr {...orderQrProps(order)} />
                <OrderProofAction orderId={order.id} hasProof={Boolean(order.proofImageUrl)} />
                {order.proofImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={order.proofImageUrl}
                    alt={t("orders.proof.thumb")}
                    className="ring-green-600/60 size-8 rounded-md object-cover ring-2"
                  />
                )}
                <span className="text-muted-foreground ml-auto">{order.warehouseCode ?? "—"}</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
