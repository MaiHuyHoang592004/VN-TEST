"use client";

import { useEffect, useState } from "react";
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
import { searchMaterialsAction } from "@/modules/inventory/suppliers/actions";
import { quickImportAction } from "@/modules/inventory/stock/actions";

import type { SiteOption } from "./stock-table";

type Option = { id: number; sku: string; name: string };

/**
 * Book in stock that arrived without a receipt — the legacy "Import stock"
 * modal, which was a FORM and never a CSV upload.
 *
 * A note is required, because this is the one way stock appears with no
 * paperwork behind it and the ledger column is the only trace of why.
 */
export function ImportStockDialog({
  sites,
  open,
  onOpenChange,
}: {
  sites: SiteOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState(String(sites[0]?.id ?? ""));
  const [quantity, setQuantity] = useState("");
  const [provider, setProvider] = useState("");
  const [note, setNote] = useState("");

  // Debounced server search: the picker must not ship the whole material list
  // to the browser, and typing five letters shouldn't fire five queries.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const id = setTimeout(() => {
      searchMaterialsAction(query).then((rows) => {
        if (!cancelled) setOptions(rows);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, open]);

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: {
      itemType: string;
      itemId: number;
      warehouseId: number;
      quantity: number;
      provider: string;
      note: string;
    }) => quickImportAction(input),
    successMessage: t("inventory.import.done"),
    errorMessages: {
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
      title={t("inventory.import.title")}
      description={t("inventory.import.description")}
      submitLabel={t("inventory.import.submit")}
      pending={pending}
      submitDisabled={!itemId}
      formError={formError}
      onSubmit={() =>
        submit({
          itemType: "MATERIAL",
          itemId: Number(itemId),
          warehouseId: Number(warehouseId),
          quantity: Number(quantity) || 0,
          provider,
          note,
        })
      }
    >
      <FormField label={t("inventory.import.item")} required error={fieldErrors.itemId}>
        {(props) => (
          <div className="flex flex-col gap-2">
            <Input
              {...props}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("inventory.import.itemPlaceholder")}
              autoComplete="off"
            />
            <Select value={itemId} onValueChange={(v) => v && setItemId(v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("inventory.import.noItem")} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name} — {o.sku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </FormField>

      <FormField label={t("inventory.import.customer")} required error={fieldErrors.warehouseId}>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("inventory.import.quantity")} required error={fieldErrors.quantity}>
          {(props) => (
            <Input
              {...props}
              type="number"
              inputMode="numeric"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="tabular-nums"
            />
          )}
        </FormField>

        <FormField label={t("inventory.import.provider")} error={fieldErrors.provider}>
          {(props) => (
            <Input {...props} value={provider} onChange={(e) => setProvider(e.target.value)} />
          )}
        </FormField>
      </div>

      <FormField label={t("inventory.import.note")} required error={fieldErrors.note}>
        {(props) => (
          <Textarea {...props} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        )}
      </FormField>
    </FormDialog>
  );
}
