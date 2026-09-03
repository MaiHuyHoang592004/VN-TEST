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
  createMockupAction,
  updateMockupAction,
} from "@/modules/catalog/mockups/actions";

export type MockupRow = {
  id: number;
  name: string;
  url: string;
  thumbnail: string | null;
  folderId: string | null;
  status: string;
  orders: number;
  updatedAt: string;
};

const EMPTY = { name: "", url: "", thumbnail: "", folderId: "", status: "active" };

/** Lowercase strings, not the ProductStatus enum: Mockup.status is a plain
 * String row and only ever means on or off. */
const STATUSES = ["active", "inactive"] as const;

export function MockupDialog({
  mockup,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  mockup?: MockupRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [values, setValues] = useState(
    mockup
      ? {
          name: mockup.name,
          url: mockup.url,
          thumbnail: mockup.thumbnail ?? "",
          folderId: mockup.folderId ?? "",
          status: mockup.status,
        }
      : EMPTY,
  );

  const set = (k: keyof typeof EMPTY, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: typeof EMPTY) =>
      mockup ? updateMockupAction(mockup.id, input) : createMockupAction(input),
    successMessage: t(mockup ? "catalog.mockups.updated" : "catalog.mockups.created"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(mockup ? "catalog.mockups.dialogEditTitle" : "catalog.mockups.dialogNewTitle")}
      description={t("catalog.mockups.dialogDesc")}
      pending={pending}
      submitDisabled={!values.name.trim() || !values.url.trim()}
      formError={formError}
      onSubmit={() => submit(values)}
    >
      <FormField label={t("catalog.mockups.fName")} required error={fieldErrors.name}>
        {(props) => (
          <Input
            {...props}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t("catalog.mockups.fNamePlaceholder")}
          />
        )}
      </FormField>

      <FormField
        label={t("catalog.mockups.fUrl")}
        required
        hint={t("catalog.mockups.fUrlHint")}
        error={fieldErrors.url}
      >
        {(props) => (
          <Input
            {...props}
            value={values.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://…"
            inputMode="url"
          />
        )}
      </FormField>

      <FormField
        label={t("catalog.mockups.fThumbnail")}
        hint={t("catalog.mockups.fThumbnailHint")}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("catalog.mockups.fFolderId")}
          hint={t("catalog.mockups.fFolderIdHint")}
          error={fieldErrors.folderId}
        >
          {(props) => (
            <Input
              {...props}
              value={values.folderId}
              onChange={(e) => set("folderId", e.target.value)}
              className="font-mono"
            />
          )}
        </FormField>

        <FormField label={t("catalog.mockups.fStatus")} error={fieldErrors.status}>
          {(props) => (
            <Select value={values.status} onValueChange={(v) => set("status", String(v))}>
              <SelectTrigger {...props}>
                <SelectValue>{t(`catalog.mockupStatuses.${values.status}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`catalog.mockupStatuses.${s}`)}
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
