"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  createMaterialAction,
  updateMaterialAction,
} from "@/modules/inventory/suppliers/actions";

export const MATERIAL_TYPES = [
  "RAW_MATERIAL",
  "PACKAGING",
  "SEMI_FINISHED",
  "CONSUMABLE",
  "OTHER",
] as const;

export type MaterialRow = {
  id: number;
  sku: string;
  name: string;
  type: string;
  uom: string;
  status: string;
  trackInventory: boolean;
  description: string | null;
  available: number;
  bomLines: number;
};

const EMPTY = {
  sku: "",
  name: "",
  type: "RAW_MATERIAL",
  uom: "pcs",
  description: "",
  status: "ACTIVE",
  trackInventory: true,
};

export function MaterialDialog({
  material,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  material?: MaterialRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [values, setValues] = useState(
    material
      ? {
          sku: material.sku,
          name: material.name,
          type: material.type,
          uom: material.uom,
          description: material.description ?? "",
          status: material.status,
          trackInventory: material.trackInventory,
        }
      : EMPTY,
  );

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: typeof EMPTY) =>
      material ? updateMaterialAction(material.id, input) : createMaterialAction(input),
    successMessage: t(material ? "inventory.suppliers.updated" : "inventory.suppliers.created"),
    errorMessages: {
      // A raw unique-constraint dump is useless to whoever hits it.
      "sku-taken": t("inventory.suppliers.errSkuTaken"),
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
      title={t(
        material ? "inventory.suppliers.dialogEditTitle" : "inventory.suppliers.dialogNewTitle",
      )}
      description={t("inventory.suppliers.dialogDesc")}
      pending={pending}
      formError={formError}
      onSubmit={() => submit(values)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("inventory.suppliers.field.sku")} required error={fieldErrors.sku}>
          {(props) => (
            <Input
              {...props}
              value={values.sku}
              onChange={(e) => set("sku", e.target.value)}
              className="font-mono"
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField label={t("inventory.suppliers.field.name")} required error={fieldErrors.name}>
          {(props) => (
            <Input {...props} value={values.name} onChange={(e) => set("name", e.target.value)} />
          )}
        </FormField>

        <FormField label={t("inventory.suppliers.field.type")} error={fieldErrors.type}>
          {(props) => (
            <Select value={values.type} onValueChange={(v) => v && set("type", v)}>
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`inventory.suppliers.types.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField
          label={t("inventory.suppliers.field.uom")}
          hint={t("inventory.suppliers.field.uomHint")}
          error={fieldErrors.uom}
        >
          {(props) => (
            <Input {...props} value={values.uom} onChange={(e) => set("uom", e.target.value)} />
          )}
        </FormField>
      </div>

      <FormField
        label={t("inventory.suppliers.field.description")}
        error={fieldErrors.description}
      >
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
          />
        )}
      </FormField>

      <FormField label={t("inventory.suppliers.field.status")} error={fieldErrors.status}>
        {(props) => (
          <Select value={values.status} onValueChange={(v) => v && set("status", v)}>
            <SelectTrigger {...props}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"].map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`catalog.statuses.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <div className="flex items-start gap-2">
        <Checkbox
          id="material-track-inventory"
          checked={values.trackInventory}
          onCheckedChange={(checked) => set("trackInventory", checked === true)}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="material-track-inventory">
            {t("inventory.suppliers.field.trackInventory")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {t("inventory.suppliers.field.trackInventoryHint")}
          </p>
        </div>
      </div>
    </FormDialog>
  );
}
