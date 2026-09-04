"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { Check, Copy, Image as ImageIcon, Printer, QrCode, ScanBarcode } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/hooks/use-permissions";

import type { OrderRow } from "./orders-table";

/**
 * The order's scannable code — the physical link between this table and the
 * floor.
 *
 * It encodes the ORDER ID and nothing else. A code carrying a URL, a JSON blob
 * or a signed token would be a second source of truth to keep in step with the
 * database; the id is the one value the scan station already resolves (its
 * "Order ID" mode reads exactly this), so paper and bench cannot drift apart.
 * Legacy's final version agreed — its barcode value was `String(order.id)`
 * after an earlier scheme packed variant+product+mockup into ten digits and
 * broke whenever any of those changed.
 *
 * BOTH FORMATS, one value. Legacy printed CODE128 and a customer's laser
 * scanners read it; a QR survives creasing, prints smaller and any phone camera
 * reads it. Rather than pick a winner and strand one set of hardware, this
 * offers both — the station's detector accepts qr_code and code_128 alike, so
 * whichever a worker points at resolves to the same order.
 */
type QrProps = {
  orderId: number;
  externalId: string | null;
  productName: string | null;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  filled: number;
  status: string;
  tracking: string | null;
  trackingStatus?: string | null;
  customerName: string | null;
  shipTo: string | null;
  placedAt?: string;
  warehouseCode?: string | null;
  marketplace?: string | null;
  note?: string | null;
  proofImageUrl?: string | null;
  /** The design the customer prints — mockup if there is one, variant image
   * otherwise. Resolved by the caller, since only the column knows which it has. */
  designImageUrl?: string | null;
};

type Format = "qr" | "barcode" | "image";

/**
 * A column → the props this modal needs.
 *
 * Four triggers open this panel (a code button and a thumbnail, on each of the
 * table and the card) and every one needs the same eighteen fields. Spelling
 * them out per trigger is how one of them ends up quietly missing `note`.
 */
export const orderQrProps = (o: OrderRow): QrProps => ({
  orderId: o.id,
  externalId: o.externalId,
  productName: o.productName,
  variantName: o.variantName,
  sku: o.sku,
  quantity: o.quantity,
  filled: o.filled,
  status: o.status,
  tracking: o.tracking,
  trackingStatus: o.trackingStatus,
  customerName: o.customerName,
  shipTo: o.shipTo,
  placedAt: o.placedAt,
  warehouseCode: o.warehouseCode,
  marketplace: o.marketplace,
  note: o.note,
  proofImageUrl: o.proofImageUrl,
  designImageUrl: o.mockupThumbnail ?? o.imageUrl,
});

export function OrderQr({
  trigger,
  initialFormat = "qr",
  ...props
}: QrProps & {
  /** Replaces the code tile — the column thumbnail, when the image is the thing
   * you clicked. Without one this is the QR button it has always been. */
  trigger?: ReactNode;
  initialFormat?: Format;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Held here rather than in the panel because the trigger decides which view
  // opens, and it has to decide on EVERY open — not just the first mount.
  const [format, setFormat] = useState<Format>(initialFormat);
  const label = t(trigger ? "orders.qr.showImage" : "orders.qr.show");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFormat(initialFormat);
          setOpen(true);
        }}
        aria-label={label}
        title={label}
        className={
          trigger
            ? "shrink-0 rounded-md transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : "border-border hover:border-foreground/40 rounded-md border bg-white p-1 transition-colors"
        }
      >
        {trigger ?? <QrCanvas value={String(props.orderId)} size={28} />}
      </button>

      {/* ResponsiveDialog is a centred dialog on desktop and a bottom SHEET on
          a phone, and it owns the one close control — a modal with two crosses
          is a modal that was assembled rather than designed. */}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("orders.qr.title")}
        description={props.externalId ?? `#${props.orderId}`}
        className="sm:max-w-2xl"
      >
        <OrderCodePanel
          {...props}
          format={format}
          onFormatChange={setFormat}
          onClose={() => setOpen(false)}
        />
      </ResponsiveDialog>
    </>
  );
}

function OrderCodePanel({
  onClose,
  format,
  onFormatChange,
  ...order
}: QrProps & {
  onClose: () => void;
  format: Format;
  onFormatChange: (f: Format) => void;
}) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  // The print SHEET is floor work; the panel around it is not.
  const canPrint = can("orders.status.update");
  const [copied, setCopied] = useState(false);
  const value = String(order.orderId);
  const complete = order.filled >= order.quantity;
  // The image tab only exists when there is an image, so the toggle never
  // offers a view that renders an empty plate.
  const formats: Format[] = order.designImageUrl
    ? ["qr", "barcode", "image"]
    : ["qr", "barcode"];

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t("orders.qr.copied"));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      {/* Two columns on a desktop: the code is a fixed square, and stacking it
          above the facts pushed everything below the fold for no reason. On a
          phone it stacks, because 390px has no second row to give. */}
      <div className="grid gap-4 sm:grid-cols-[196px_1fr]">
        <div className="space-y-2">
          {/* White plate, always: a scanner needs the quiet zone to be actually
              white, and this app is usually in dark mode. */}
          <div className="flex min-h-[164px] items-center justify-center rounded-lg bg-white p-3">
            {/* Image first and QR last so the fallback is the code that always
                encodes, rather than an <img> with no src. */}
            {format === "image" && order.designImageUrl ? (
              // Click through to the original: this plate is 172px wide, and
              // "is the artwork right" is a question that needs real pixels.
              <a href={order.designImageUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.designImageUrl}
                  alt={order.productName ?? t("orders.qr.format.image")}
                  className="max-h-[150px] max-w-full object-contain"
                />
              </a>
            ) : format === "barcode" ? (
              <BarcodeSvg value={value} height={70} />
            ) : (
              <QrCanvas value={value} size={150} />
            )}
          </div>

          {/* One code at a time. Showing both halves each, and a half-size code
              is the one a scanner argues with. */}
          <div className={`grid gap-1 ${formats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {formats.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onFormatChange(f)}
                aria-pressed={format === f}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  format === f
                    ? "bg-secondary text-secondary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "qr" ? (
                  <QrCode className="size-3.5" />
                ) : f === "barcode" ? (
                  <ScanBarcode className="size-3.5" />
                ) : (
                  <ImageIcon className="size-3.5" />
                )}
                {t(`orders.qr.format.${f}`)}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={copy}
            className="border-border hover:border-foreground/30 flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors"
          >
            <span className="min-w-0">
              <span className="text-muted-foreground block text-[10px] font-medium uppercase">
                {t("orders.qr.scanValue")}
              </span>
              <span className="block truncate font-mono text-sm">{value}</span>
            </span>
            {copied ? (
              <Check className="stroke-green-600 size-3.5 shrink-0" />
            ) : (
              <Copy className="text-muted-foreground size-3.5 shrink-0" />
            )}
          </button>
        </div>

        {/* Facts, densest first. Two per line even on a phone — these are short
            values, and one per line would make this a scroll. */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 self-start">
          <Detail label={t("orders.colOrder")} value={order.externalId ?? `#${order.orderId}`} mono />
          <div className="min-w-0">
            <Label>{t("orders.colStatus")}</Label>
            <dd className="mt-0.5 flex flex-wrap items-center gap-1">
              <Badge
                variant={
                  order.status === "CANCELLED" || order.status === "ON_HOLD"
                    ? "destructive"
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
            </dd>
          </div>

          <Detail label={t("orders.colProduct")} value={order.productName} />
          <Detail
            label={t("orders.qr.variant")}
            value={[order.variantName, order.sku].filter(Boolean).join(" · ")}
          />

          <Detail
            label={t("orders.colQty")}
            value={order.filled > 0 ? `${order.filled} / ${order.quantity}` : String(order.quantity)}
          />
          <Detail label={t("orders.colWarehouse")} value={order.warehouseCode ?? null} mono />

          <div className="col-span-2">
            <Label>{t("orders.colTracking")}</Label>
            <dd className="mt-0.5 text-sm">
              {order.tracking ? (
                <span className="font-mono text-xs">
                  {order.tracking}
                  {order.trackingStatus && (
                    <span className="text-muted-foreground font-sans"> · {order.trackingStatus}</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">{t("orders.qr.noTracking")}</span>
              )}
            </dd>
          </div>

          <div className="col-span-2">
            <Detail
              label={t("orders.qr.shipTo")}
              value={[order.customerName, order.shipTo].filter(Boolean).join(" — ")}
            />
          </div>

          <div className="col-span-2 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Detail
                label={t("orders.colPlaced")}
                value={[
                  order.marketplace,
                  order.placedAt ? new Date(order.placedAt).toLocaleDateString() : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {order.note && (
                <div className="mt-2.5">
                  <Detail label={t("orders.qr.note")} value={order.note} />
                </div>
              )}
            </div>
            {/* A thumbnail, not a banner: it answers "is there a photo, and is
                it obviously the wrong parcel" — the full-size look belongs in
                the lightbox at the station. */}
            {order.proofImageUrl && (
              <a href={order.proofImageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.proofImageUrl}
                  alt={t("orders.proof.thumb")}
                  title={t("orders.proof.thumb")}
                  className="ring-green-600/60 size-14 rounded-md object-cover ring-2"
                />
              </a>
            )}
          </div>
        </dl>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t("common.close")}
        </Button>
        {/* Reuses the print sheet rather than hand-rolling a print window: one
            layout to maintain, and it already prints itself on load.
            GATED, and not for tidiness: this panel has TWO ways in. The floor
            reaches it from the QR column, which is already behind
            orders.status.update — but a seller reaches it by tapping their own
            artwork thumbnail (orders-table.tsx, order-mobile-card.tsx), which is
            deliberately ungated because looking at your own design is not floor
            work. /orders/print calls requirePermission("orders.status.update"),
            so without this check the seller's own thumbnail hands them a button
            that opens a new tab and 403s. Hiding it is cosmetics; the page's
            own guard is the security. */}
        {canPrint && (
          <Button
            size="sm"
            onClick={() => window.open(`/orders/print?ids=${order.orderId}`, "_blank", "noopener")}
          >
            <Printer className="size-4" />
            {t("orders.qr.print")}
          </Button>
        )}
      </div>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <dt className="text-muted-foreground text-[11px] font-medium uppercase">{children}</dt>
);

function Detail({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <dd className={`mt-1 break-words text-sm ${mono ? "font-mono text-xs" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

/**
 * A canvas, not an <img>: toDataURL would keep a base64 copy of every code in
 * memory for a 200-column table.
 *
 * Margin 1 rather than the library default of 4 — a quiet zone that wide
 * shrinks the modules until a 28px cell is unreadable to a scanner.
 */
function QrCanvas({ value, size }: { value: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => setFailed(true));
  }, [value, size]);

  if (failed) return <span className="text-muted-foreground text-xs">—</span>;
  return <canvas ref={ref} width={size} height={size} className="block" />;
}

/**
 * CODE128 of the same value — what legacy printed, and what a customer's
 * existing laser scanners expect. SVG rather than canvas so it stays crisp when
 * the print sheet scales it to paper.
 */
export function BarcodeSvg({ value, height = 60 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        lineColor: "#000000",
        background: "#ffffff",
        width: 2,
        height,
        margin: 6,
        displayValue: true,
        fontSize: 14,
        textMargin: 4,
      });
    } catch {
      // A value CODE128 cannot encode is not worth a broken screen; the QR
      // carries the same id.
    }
  }, [value, height]);

  return <svg ref={ref} className="max-w-full" />;
}
