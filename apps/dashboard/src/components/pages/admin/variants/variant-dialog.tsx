"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
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
  createVariantAction,
  updateVariantAction,
} from "@/modules/catalog/variants/actions";

export type VariantRow = {
  id: number;
  name: string;
  key: string;
  status: string;
  skus: number;
  updatedAt: string;
};

const EMPTY = { name: "", key: "", status: "ACTIVE" };

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export function VariantDialog({
  product,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  product?: VariantRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [values, setValues] = useState(
    product ? { name: product.name, key: product.key, status: product.status } : EMPTY,
  );
  const [keyTouched, setKeyTouched] = useState(Boolean(product));

  const set = (k: keyof typeof EMPTY, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: typeof EMPTY) =>
      product ? updateVariantAction(product.id, input) : createVariantAction(input),
    successMessage: t(product ? "catalog.variants.updated" : "catalog.variants.created"),
    errorMessages: { "key-taken": t("catalog.variants.errKeyTaken") },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(product ? "catalog.variants.dialogEditTitle" : "catalog.variants.dialogNewTitle")}
      description={t("catalog.variants.dialogDesc")}
      pending={pending}
      submitDisabled={!values.name.trim() || !values.key.trim()}
      formError={formError}
      onSubmit={() => submit(values)}
    >
      <FormField label={t("catalog.variants.fName")} required error={fieldErrors.name}>
        {(props) => (
          <Input
            {...props}
            value={values.name}
            onChange={(e) => {
              const name = e.target.value;
              setValues((s) => ({ ...s, name, key: keyTouched ? s.key : slugify(name) }));
            }}
            placeholder={t("catalog.variants.fNamePlaceholder")}
          />
        )}
      </FormField>

      <FormField
        label={t("catalog.variants.fKey")}
        required
        hint={t(product ? "catalog.variants.fKeyHintLocked" : "catalog.variants.fKeyHint")}
        error={fieldErrors.key}
      >
        {(props) => (
          <Input
            {...props}
            value={values.key}
            onChange={(e) => {
              setKeyTouched(true);
              set("key", e.target.value.toLowerCase());
            }}
            placeholder="brown"
            className="font-mono"
          />
        )}
      </FormField>

      <FormField label={t("catalog.variants.fStatus")} error={fieldErrors.status}>
        {(props) => (
          <Select value={values.status} onValueChange={(v) => set("status", String(v))}>
            <SelectTrigger {...props}>
              {/* Base UI renders the raw VALUE unless given children. */}
              <SelectValue>{t(`catalog.statuses.${values.status}`)}</SelectValue>
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
    </FormDialog>
  );
}
