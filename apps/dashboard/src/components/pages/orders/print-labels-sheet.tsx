"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

import { useTranslation } from "@/lib/i18n";

import { BarcodeSvg } from "./order-qr";

export type PrintRow = {
  id: number;
  externalId: string | null;
  productName: string | null;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  tracking: string | null;
  customerName: string | null;
  warehouseCode: string | null;
};

/**
 * The sheet that goes on the boxes.
 *
 * Print CSS does the layout: a 14mm page margin (inside every desktop
 * printer's unprintable edge), blocks that never split across a page, and
 * everything that is screen furniture hidden. It prints itself on load,
 * because a page opened from a "Print" button that then makes you press
 * Ctrl+P is a page that wastes the click it was given.
 */
export function PrintLabelsSheet({ orders }: { orders: PrintRow[] }) {
  const { t } = useTranslation();
  const printed = useRef(false);

  useEffect(() => {
    // Once per mount. React 18+ runs effects twice in development, and two
    // print dialogs is a genuinely confusing bug to be handed.
    if (printed.current || !orders.length) return;
    printed.current = true;
    // A frame's grace so the canvases have drawn — printing a page of empty
    // boxes is worse than printing a moment later.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [orders.length]);

  if (!orders.length) {
    return <p className="p-8 text-sm">{t("orders.qr.printEmpty")}</p>;
  }

  return (
    <>
      <style>{`
        @page { margin: 14mm; }
        @media print {
          html, body { background: #fff !important; }
          /* Everything the app draws around a page: not on paper. */
          nav, header, aside, footer, [data-slot="sidebar"], .no-print { display: none !important; }
          .print-block { page-break-inside: avoid; break-inside: avoid; }
        }
        .print-block { max-width: 460px; }
      `}</style>

      <main className="mx-auto w-full max-w-3xl bg-white p-8 text-black">
        <div className="no-print mb-6 flex items-center justify-between">
          <p className="text-sm text-navy-500">
            {t("orders.qr.printCount").replace("{count}", String(orders.length))}
          </p>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-(--border-soft) px-3 py-1.5 text-sm"
          >
            {t("orders.qr.print")}
          </button>
        </div>

        <div className="space-y-4">
          {orders.map((o) => (
            <article
              key={o.id}
              className="print-block flex gap-4 rounded-md border border-(--border-soft) p-4"
            >
              <PrintQr value={String(o.id)} />
              <div className="min-w-0 flex-1 text-sm leading-tight">
                <p className="font-mono font-semibold">{o.externalId ?? `#${o.id}`}</p>
                <p className="mt-1">{o.productName ?? "—"}</p>
                <p className="text-navy-500">
                  {[o.variantName, o.sku].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {t("orders.colQty")}: {o.quantity}
                </p>
                {o.tracking && <p className="mt-1 font-mono text-xs">{o.tracking}</p>}
                <p className="mt-1 text-xs text-navy-500">
                  {[o.customerName, o.warehouseCode].filter(Boolean).join(" · ")}
                </p>
                {/* CODE128 as well as the QR: the floor's laser scanners read
                    one, phones read the other, and both resolve to this
                    order's id. */}
                <BarcodeSvg value={String(o.id)} height={38} />
              </div>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}

/** The scannable half. Margin 2 here rather than the table's 1: paper needs a
 * real quiet zone, and this block is not fighting for pixels. */
function PrintQr({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ref.current) {
      void QRCode.toCanvas(ref.current, value, { width: 120, margin: 2 }).catch(() => {});
    }
  }, [value]);

  return <canvas ref={ref} width={120} height={120} className="shrink-0" />;
}
