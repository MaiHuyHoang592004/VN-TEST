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
  createProductAction,
  updateProductAction,
} from "@/modules/catalog/products/actions";

export type ProductRow = {
  id: number;
  name: string;
  key: string;
  thumbnail: string | null;
  status: string;
  skus: number;
  updatedAt: string;
};

const EMPTY = { name: "", key: "", thumbnail: "", status: "DRAFT" };

/** Machine key from a display name: what a person would type, minus the
 * mistakes. Only offered while creating — changing a key later breaks the
 * spreadsheet imports and API calls that reference it. */
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export function ProductDialog({
  variant,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  variant?: ProductRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [values, setValues] = useState(
    variant
      ? {
          name: variant.name,
          key: variant.key,
          thumbnail: variant.thumbnail ?? "",
          status: variant.status,
        }
      : EMPTY,
  );
  // Stop auto-filling the key the moment someone types their own, so their
  // edit isn't overwritten by the next keystroke in the name field.
  const [keyTouched, setKeyTouched] = useState(Boolean(variant));

  const set = (k: keyof typeof EMPTY, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: typeof EMPTY) =>
      variant ? updateProductAction(variant.id, input) : createProductAction(input),
    successMessage: t(variant ? "catalog.products.updated" : "catalog.products.created"),
    errorMessages: { "key-taken": t("catalog.products.errKeyTaken") },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(variant ? "catalog.products.dialogEditTitle" : "catalog.products.dialogNewTitle")}
      description={t("catalog.products.dialogDesc")}
      pending={pending}
      submitDisabled={!values.name.trim() || !values.key.trim()}
      formError={formError}
      onSubmit={() => submit(values)}
    >
      <FormField label={t("catalog.products.fName")} required error={fieldErrors.name}>
        {(props) => (
          <Input
            {...props}
            value={values.name}
            onChange={(e) => {
              const name = e.target.value;
              setValues((s) => ({
                ...s,
                name,
                key: keyTouched ? s.key : slugify(name),
              }));
            }}
            placeholder={t("catalog.products.fNamePlaceholder")}
          />
        )}
      </FormField>

      <FormField
        label={t("catalog.products.fKey")}
        required
        hint={t(variant ? "catalog.products.fKeyHintLocked" : "catalog.products.fKeyHint")}
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
            placeholder="leather-wallet"
            className="font-mono"
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("catalog.products.fThumbnail")}
          hint={t("catalog.products.fThumbnailHint")}
          error={fieldErrors.thumbnail}
        >
          {(props) => (
            <Input
              {...props}
              value={values.thumbnail}
              onChange={(e) => set("thumbnail", e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          )}
        </FormField>

        <FormField label={t("catalog.products.fStatus")} error={fieldErrors.status}>
          {(props) => (
            <Select value={values.status} onValueChange={(v) => set("status", String(v))}>
              <SelectTrigger {...props}>
                {/* Base UI renders the raw VALUE unless given children, so this
                    would read "DRAFT" rather than the translated label. */}
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
      </div>
    </FormDialog>
  );
}
