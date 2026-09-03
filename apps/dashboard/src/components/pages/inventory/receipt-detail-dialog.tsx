"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/global/form";
import { Can } from "@/components/global/permission-gate";
import { useTranslation } from "@/lib/i18n";
import {
  addEvidenceAction,
  getReceiptAction,
  receiveShipmentAction,
  rejectReceiptAction,
} from "@/modules/inventory/receipts/actions";

type Receipt = Awaited<ReturnType<typeof getReceiptAction>>;
type Shipment = Receipt["shipments"][number];
type Line = Shipment["lines"][number];

const OPEN_SHIPMENT = ["PENDING", "PARTIAL_RECEIVED"];
const OPEN_RECEIPT = ["PENDING", "PARTIAL"];

/**
 * One receipt in full: its shipments, their lines, and the two things the
 * floor does here — book in what arrived, and photograph it.
 *
 * The receive inputs are prefilled with the CURRENT totals, not blanks. That
 * is the delta rule surfacing in the UI: you type what the running total now
 * is, and the server moves stock by the difference. Prefilling blanks would
 * invite someone to type "3 more" into a field that means "3 in total".
 */
export function ReceiptDetailDialog({
  receiptId,
  open,
  onOpenChange,
}: {
  receiptId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => getReceiptAction(receiptId).then(setReceipt);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getReceiptAction(receiptId).then((r) => {
      if (!cancelled) setReceipt(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, receiptId]);

  const errorText = (code: string) =>
    t(`inventory.receipts.errors.${code}`) === `inventory.receipts.errors.${code}`
      ? t(`inventory.errors.${code}`)
      : t(`inventory.receipts.errors.${code}`);

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | unknown>, okMessage: string) =>
    startTransition(async () => {
      const result = (await fn()) as { ok?: boolean; error?: string };
      if (result?.ok === false && result.error) {
        toast.error(errorText(result.error));
        return;
      }
      toast.success(okMessage);
      // Reload in place: the user is mid-task on this receipt and navigating
      // away to see the new numbers would lose their place.
      await load();
      router.refresh();
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={receipt ? receipt.code : t("inventory.receipts.detail.title")}
      description={receipt ? `${receipt.warehouse.name} · ${receipt.shipments.length}` : undefined}
      className="sm:max-w-3xl"
    >
      {!receipt ? (
        <p className="text-muted-foreground py-6 text-sm">…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={receipt.status === "COMPLETE" ? "default" : "secondary"}>
              {t(`inventory.receipts.status.${receipt.status}`)}
            </Badge>
            {receipt.provider && (
              <span className="text-muted-foreground text-sm">{receipt.provider}</span>
            )}
            {receipt.rejectReason && (
              <span className="text-vercel-red text-sm">{receipt.rejectReason}</span>
            )}
          </div>

          {receipt.shipments.map((shipment) => (
            <ShipmentPanel
              key={shipment.id}
              receipt={receipt}
              shipment={shipment}
              pending={pending}
              onReceive={(lines) =>
                run(
                  () => receiveShipmentAction({ receiptId, shipmentId: shipment.id, lines }),
                  t("inventory.receipts.received"),
                )
              }
              onUpload={(files) => {
                const form = new FormData();
                form.set("receiptId", String(receiptId));
                form.set("shipmentId", String(shipment.id));
                for (const file of files) form.append("files", file);
                run(() => addEvidenceAction(form), t("inventory.receipts.uploaded"));
              }}
            />
          ))}

          {OPEN_RECEIPT.includes(receipt.status) && (
            <Can permission="inventory.receipts.receive">
              <RejectRow
                pending={pending}
                onReject={(reason) =>
                  run(
                    () => rejectReceiptAction({ receiptId, reason }),
                    t("inventory.receipts.rejected"),
                  )
                }
              />
            </Can>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}

function ShipmentPanel({
  receipt,
  shipment,
  pending,
  onReceive,
  onUpload,
}: {
  receipt: Receipt;
  shipment: Shipment;
  pending: boolean;
  onReceive: (lines: { lineId: number; receivedQuantity: number; rejectedQuantity: number }[]) => void;
  onUpload: (files: File[]) => void;
}) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const receivable =
    OPEN_SHIPMENT.includes(shipment.status) && OPEN_RECEIPT.includes(receipt.status);

  // Prefilled with what is already booked in — see the component doc.
  const [draft, setDraft] = useState<Record<number, { received: string; rejected: string }>>(() =>
    Object.fromEntries(
      shipment.lines.map((l) => [
        l.id,
        {
          received: String(l.receivedQuantity ?? l.requestedQuantity),
          rejected: String(l.rejectedQuantity ?? 0),
        },
      ]),
    ),
  );

  const evidence = Array.isArray(shipment.evidence)
    ? (shipment.evidence as { url: string; originalFilename?: string }[])
    : [];

  const meta = [
    shipment.vendor?.name,
    shipment.trackingNumber,
    shipment.carrier,
    shipment.expectedArrivalAt
      ? new Date(shipment.expectedArrivalAt).toLocaleDateString()
      : null,
  ].filter(Boolean);

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-sm font-medium">{shipment.shipmentCode}</p>
          {meta.length > 0 && (
            <p className="text-muted-foreground text-xs">{meta.join(" · ")}</p>
          )}
        </div>
        <Badge variant={shipment.status === "RECEIVED" ? "default" : "secondary"}>
          {t(`inventory.receipts.shipStatus.${shipment.status}`)}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="px-2 py-1 text-left">{t("inventory.receipts.form.item")}</th>
              <th className="px-2 py-1 text-right">{t("inventory.receipts.detail.expected")}</th>
              <th className="px-2 py-1 text-right">{t("inventory.receipts.detail.receivedQty")}</th>
              <th className="px-2 py-1 text-right">{t("inventory.receipts.detail.rejectedQty")}</th>
            </tr>
          </thead>
          <tbody>
            {shipment.lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                receivable={receivable}
                draft={draft[line.id]!}
                onChange={(patch) =>
                  setDraft((d) => ({ ...d, [line.id]: { ...d[line.id]!, ...patch } }))
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {receivable && (
          <Can permission="inventory.receipts.receive">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                onReceive(
                  shipment.lines.map((l) => ({
                    lineId: l.id,
                    receivedQuantity: Number(draft[l.id]!.received) || 0,
                    rejectedQuantity: Number(draft[l.id]!.rejected) || 0,
                  })),
                )
              }
            >
              {t("inventory.receipts.detail.receive")}
            </Button>
          </Can>
        )}

        <Can permission="inventory.receipts.receive">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onUpload(files);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => fileInput.current?.click()}
          >
            {t("inventory.receipts.detail.upload")}
          </Button>
        </Can>
      </div>

      <div className="flex flex-wrap gap-2">
        {evidence.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            {t("inventory.receipts.detail.noEvidence")}
          </span>
        ) : (
          evidence.map((file) => (
            <a
              key={file.url}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="border-border hover:border-foreground/30 block size-16 overflow-hidden rounded border transition-colors"
            >
              {/* Plain <img>: these are user uploads on an arbitrary storage
                  host, which next/image would need configuring per domain. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.url}
                alt={file.originalFilename ?? ""}
                className="size-full object-cover"
              />
            </a>
          ))
        )}
      </div>
    </div>
  );
}

function LineRow({
  line,
  receivable,
  draft,
  onChange,
}: {
  line: Line;
  receivable: boolean;
  draft: { received: string; rejected: string };
  onChange: (patch: Partial<{ received: string; rejected: string }>) => void;
}) {
  const name = line.material
    ? `${line.material.name} · ${line.material.sku}`
    : line.productVariant
      ? `${line.productVariant.variant.name} · ${line.productVariant.sku ?? ""}`
      : "—";

  return (
    <tr className="border-border border-t">
      <td className="px-2 py-1.5">{name}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{line.requestedQuantity}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {receivable ? (
          <Input
            type="number"
            min={0}
            value={draft.received}
            onChange={(e) => onChange({ received: e.target.value })}
            className="ml-auto h-8 w-20 tabular-nums"
          />
        ) : (
          (line.receivedQuantity ?? 0)
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {receivable ? (
          <Input
            type="number"
            min={0}
            value={draft.rejected}
            onChange={(e) => onChange({ rejected: e.target.value })}
            className="ml-auto h-8 w-20 tabular-nums"
          />
        ) : (
          line.rejectedQuantity
        )}
      </td>
    </tr>
  );
}

function RejectRow({
  pending,
  onReject,
}: {
  pending: boolean;
  onReject: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("inventory.receipts.detail.rejectReason")}
        className="max-w-xs"
      />
      <Button variant="destructive" size="sm" disabled={pending} onClick={() => onReject(reason)}>
        {t("inventory.receipts.detail.reject")}
      </Button>
    </div>
  );
}
