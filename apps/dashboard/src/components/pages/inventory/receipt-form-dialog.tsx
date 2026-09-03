"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  createReceiptAction,
  updateReceiptAction,
} from "@/modules/inventory/receipts/actions";

import type { MaterialOption, SiteOption } from "./receipts-table";

type DraftLine = { materialId: string; requestedQuantity: string; unitPrice: string; note: string };
type DraftShipment = {
  shipmentCode: string;
  trackingNumber: string;
  carrier: string;
  expectedArrivalAt: string;
  lines: DraftLine[];
};

const emptyLine = (): DraftLine => ({ materialId: "", requestedQuantity: "", unitPrice: "", note: "" });
const emptyShipment = (): DraftShipment => ({
  shipmentCode: "",
  trackingNumber: "",
  carrier: "",
  expectedArrivalAt: "",
  lines: [emptyLine()],
});

/**
 * The multi-shipment form, as legacy ran it: header, then N shipments, each
 * with N lines. Remove buttons disable at one — a receipt with no shipment, or
 * a shipment with no line, is not a thing the server will accept, so the form
 * does not offer to build one.
 *
 * Materials only for now: a PRODUCT receipt needs a SKU picker, and nothing
 * asks for one until finished goods are actually bought in rather than made.
 */
export function ReceiptFormDialog({
  sites,
  suppliers,
  receipt,
  open,
  onOpenChange,
}: {
  sites: SiteOption[];
  suppliers: MaterialOption[];
  /** Omit to create. Editing is only offered while the receipt is PENDING. */
  receipt?: { id: number; warehouseId: number; provider: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [warehouseId, setWarehouseId] = useState(
    String(receipt?.warehouseId ?? sites[0]?.id ?? ""),
  );
  const [provider, setProvider] = useState(receipt?.provider ?? "");
  const [note, setNote] = useState("");
  const [shipments, setShipments] = useState<DraftShipment[]>([emptyShipment()]);

  const patchShipment = (index: number, patch: Partial<DraftShipment>) =>
    setShipments((s) => s.map((sh, i) => (i === index ? { ...sh, ...patch } : sh)));

  const patchLine = (si: number, li: number, patch: Partial<DraftLine>) =>
    setShipments((s) =>
      s.map((sh, i) =>
        i === si
          ? { ...sh, lines: sh.lines.map((l, j) => (j === li ? { ...l, ...patch } : l)) }
          : sh,
      ),
    );

  const { submit, pending, formError } = useFormAction({
    action: (input: unknown) =>
      receipt ? updateReceiptAction(receipt.id, input) : createReceiptAction(input),
    successMessage: t(receipt ? "inventory.receipts.updated" : "inventory.receipts.created"),
    errorMessages: {
      "not-editable": t("inventory.receipts.errors.not-editable"),
      "not-found": t("inventory.receipts.errors.not-found"),
      "item-not-found": t("inventory.errors.item-not-found"),
      "customer-not-allowed": t("inventory.errors.customer-not-allowed"),
    },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  const onSubmit = () =>
    submit({
      itemType: "MATERIAL",
      warehouseId: Number(warehouseId),
      provider,
      note,
      shipments: shipments.map((s) => ({
        shipmentCode: s.shipmentCode,
        trackingNumber: s.trackingNumber,
        carrier: s.carrier,
        // <input type="date"> gives "2026-07-22"; the schema takes a string and
        // the service turns it into a Date, so no parsing lives in the form.
        expectedArrivalAt: s.expectedArrivalAt,
        lines: s.lines.map((l) => ({
          materialId: Number(l.materialId) || undefined,
          requestedQuantity: Number(l.requestedQuantity) || 0,
          unitPrice: l.unitPrice === "" ? undefined : Number(l.unitPrice),
          note: l.note,
        })),
      })),
    });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(receipt ? "inventory.receipts.form.editTitle" : "inventory.receipts.form.title")}
      description={t("inventory.receipts.form.desc")}
      submitLabel={t(receipt ? "inventory.receipts.form.save" : "inventory.receipts.form.submit")}
      pending={pending}
      formError={formError}
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("inventory.receipts.form.warehouse")} required>
          {(props) => (
            <Select value={warehouseId} onValueChange={(v) => v && setWarehouseId(v)}>
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label={t("inventory.receipts.form.provider")}>
          {(props) => (
            <Input {...props} value={provider} onChange={(e) => setProvider(e.target.value)} />
          )}
        </FormField>
      </div>

      <FormField label={t("inventory.receipts.form.note")}>
        {(props) => (
          <Textarea {...props} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        )}
      </FormField>

      {shipments.map((shipment, si) => (
        <div key={si} className="border-border flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {t("inventory.receipts.form.shipment")} {si + 1}
            </p>
            <Button
              type="button"
              product="ghost"
              size="sm"
              disabled={shipments.length === 1}
              onClick={() => setShipments((s) => s.filter((_, i) => i !== si))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t("inventory.receipts.detail.tracking")}>
              {(props) => (
                <Input
                  {...props}
                  value={shipment.trackingNumber}
                  onChange={(e) => patchShipment(si, { trackingNumber: e.target.value })}
                />
              )}
            </FormField>
            <FormField label={t("inventory.receipts.detail.carrier")}>
              {(props) => (
                <Input
                  {...props}
                  value={shipment.carrier}
                  onChange={(e) => patchShipment(si, { carrier: e.target.value })}
                />
              )}
            </FormField>
            <FormField label={t("inventory.receipts.detail.eta")}>
              {/* Native date input: no picker dependency, and it speaks the
                  viewer's locale and calendar for free. */}
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={shipment.expectedArrivalAt}
                  onChange={(e) => patchShipment(si, { expectedArrivalAt: e.target.value })}
                />
              )}
            </FormField>
          </div>

          {shipment.lines.map((line, li) => (
            <div key={li} className="grid items-end gap-2 sm:grid-cols-[1fr_6rem_6rem_2.5rem]">
              <FormField label={t("inventory.receipts.form.item")} required>
                {(props) => (
                  <Select
                    value={line.materialId}
                    onValueChange={(v) => v && patchLine(si, li, { materialId: v })}
                  >
                    <SelectTrigger {...props}>
                      <SelectValue placeholder={t("inventory.import.noItem")} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name} — {m.sku}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>

              <FormField label={t("inventory.receipts.form.quantity")} required>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    className="tabular-nums"
                    value={line.requestedQuantity}
                    onChange={(e) => patchLine(si, li, { requestedQuantity: e.target.value })}
                  />
                )}
              </FormField>

              <FormField label={t("inventory.receipts.detail.unitPrice")}>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={0}
                    step="0.01"
                    className="tabular-nums"
                    value={line.unitPrice}
                    onChange={(e) => patchLine(si, li, { unitPrice: e.target.value })}
                  />
                )}
              </FormField>

              <Button
                type="button"
                product="ghost"
                size="icon"
                disabled={shipment.lines.length === 1}
                aria-label={t("inventory.receipts.form.remove")}
                onClick={() =>
                  patchShipment(si, { lines: shipment.lines.filter((_, j) => j !== li) })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            product="outline"
            size="sm"
            className="self-start"
            onClick={() => patchShipment(si, { lines: [...shipment.lines, emptyLine()] })}
          >
            {t("inventory.receipts.form.addLine")}
          </Button>
        </div>
      ))}

      <Button
        type="button"
        product="outline"
        size="sm"
        className="self-start"
        onClick={() => setShipments((s) => [...s, emptyShipment()])}
      >
        {t("inventory.receipts.form.addShipment")}
      </Button>
    </FormDialog>
  );
}
