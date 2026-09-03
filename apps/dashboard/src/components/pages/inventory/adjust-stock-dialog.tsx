"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
import { adjustStockAction } from "@/modules/inventory/stock/actions";

import type { StockRowView, SiteOption } from "./stock-table";

/**
 * Correct one count at one site.
 *
 * ONE signed field, no +/- toggle: the sign IS the direction. That was the
 * legacy modal's contract and the floor already knows it, so adding a toggle
 * would be a new thing to get wrong rather than a clarification.
 */
export function AdjustStockDialog({
  column,
  sites,
  open,
  onOpenChange,
}: {
  column: StockRowView;
  sites: SiteOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  // Prefilled with the site this item actually sits in, when there is only
  // one — the common case, and one less thing to pick.
  const [warehouseId, setWarehouseId] = useState(
    String(column.warehouses[0]?.id ?? sites[0]?.id ?? ""),
  );
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: {
      itemType: string;
      itemId: number;
      warehouseId: number;
      quantityDelta: number;
      reason: string;
      note: string;
    }) => adjustStockAction(input),
    successMessage: t("inventory.adjust.done"),
    errorMessages: {
      "below-zero": t("inventory.errors.below-zero"),
      "customer-not-allowed": t("inventory.errors.customer-not-allowed"),
      "item-not-found": t("inventory.errors.item-not-found"),
    },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("inventory.adjust.title")}
      description={`${column.sku} — ${column.name}`}
      submitLabel={t("inventory.adjust.submit")}
      pending={pending}
      formError={formError}
      onSubmit={() =>
        submit({
          itemType: column.itemType,
          itemId: column.itemId,
          warehouseId: Number(warehouseId),
          // NaN on an empty box would reach the server as null and read as a
          // type error; 0 is refused by the schema with a sentence instead.
          quantityDelta: Number(delta) || 0,
          reason,
          note,
        })
      }
    >
      <p className="text-muted-foreground text-sm">{t("inventory.adjust.description")}</p>

      <FormField label={t("inventory.adjust.warehouse")} required error={fieldErrors.warehouseId}>
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

      <FormField
        label={t("inventory.adjust.delta")}
        hint={t("inventory.adjust.deltaHint")}
        required
        error={fieldErrors.quantityDelta}
      >
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="numeric"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="tabular-nums"
          />
        )}
      </FormField>

      <FormField label={t("inventory.adjust.reason")} required error={fieldErrors.reason}>
        {(props) => (
          <Input
            {...props}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("inventory.adjust.reasonPlaceholder")}
          />
        )}
      </FormField>

      <FormField label={t("inventory.adjust.note")} error={fieldErrors.note}>
        {(props) => (
          <Textarea {...props} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        )}
      </FormField>
    </FormDialog>
  );
}
