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
import {
  createWarehouseAction,
  updateWarehouseAction,
} from "@/modules/inventory/warehouses/actions";

export type WarehouseRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  region: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  timezone: string;
  status: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  members: number;
  orders: number;
};

const EMPTY = {
  code: "",
  name: "",
  description: "",
  region: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  zip: "",
  country: "",
  timezone: "Asia/Ho_Chi_Minh",
  status: "ACTIVE",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
};

export function WarehouseDialog({
  customer,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  customer?: WarehouseRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [values, setValues] = useState(
    customer
      ? {
          code: customer.code,
          name: customer.name,
          description: customer.description ?? "",
          region: customer.region ?? "",
          line1: customer.line1 ?? "",
          line2: customer.line2 ?? "",
          city: customer.city ?? "",
          state: customer.state ?? "",
          zip: customer.zip ?? "",
          country: customer.country ?? "",
          timezone: customer.timezone,
          status: customer.status,
          contactName: customer.contactName ?? "",
          contactEmail: customer.contactEmail ?? "",
          contactPhone: customer.contactPhone ?? "",
        }
      : EMPTY,
  );

  const set = (key: keyof typeof EMPTY, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: typeof EMPTY) =>
      customer
        ? updateWarehouseAction(customer.id, input)
        : createWarehouseAction(input),
    successMessage: t(customer ? "admin.warehouses.updated" : "admin.warehouses.created"),
    errorMessages: {
      // A raw unique-constraint dump is useless to whoever hits it.
      "code-taken": t("admin.warehouses.errCodeTaken"),
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
      title={t(customer ? "admin.warehouses.dialogEditTitle" : "admin.warehouses.dialogNewTitle")}
      description={t("admin.warehouses.dialogDesc")}
      pending={pending}
      submitDisabled={!values.code.trim() || !values.name.trim()}
      formError={formError}
      onSubmit={() => submit({ ...values, code: values.code.toUpperCase() })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("admin.warehouses.fCode")}
          required
          hint={t("admin.warehouses.fCodeHint")}
          error={fieldErrors.code}
        >
          {(props) => (
            <Input
              {...props}
              value={values.code}
              // Uppercased as you type so what you see is what's stored.
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="HCM-01"
              className="font-mono"
            />
          )}
        </FormField>

        <FormField label={t("admin.warehouses.fName")} required error={fieldErrors.name}>
          {(props) => (
            <Input
              {...props}
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ho Chi Minh Main"
            />
          )}
        </FormField>
      </div>

      <FormField label={t("admin.warehouses.fDescription")} error={fieldErrors.description}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={t("admin.warehouses.fDescriptionPlaceholder")}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("admin.warehouses.fRegion")} hint={t("admin.warehouses.fRegionHint")}>
          {(props) => (
            <Input
              {...props}
              value={values.region}
              onChange={(e) => set("region", e.target.value)}
              placeholder="VN-South"
            />
          )}
        </FormField>

        <FormField label={t("admin.warehouses.fStatus")}>
          {(props) => (
            <Select value={values.status} onValueChange={(v) => v && set("status", v)}>
              <SelectTrigger {...props}>
                <SelectValue>{t(`admin.statuses.${values.status}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{t("admin.statuses.ACTIVE")}</SelectItem>
                <SelectItem value="INACTIVE">{t("admin.statuses.INACTIVE")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      <FormField label={t("admin.warehouses.fAddress")}>
        {(props) => (
          <Input
            {...props}
            value={values.line1}
            onChange={(e) => set("line1", e.target.value)}
            placeholder={t("admin.warehouses.fAddressPlaceholder")}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t("admin.warehouses.fCity")}>
          {(props) => (
            <Input {...props} value={values.city} onChange={(e) => set("city", e.target.value)} />
          )}
        </FormField>
        <FormField label={t("admin.warehouses.fState")}>
          {(props) => (
            <Input {...props} value={values.state} onChange={(e) => set("state", e.target.value)} />
          )}
        </FormField>
        <FormField label={t("admin.warehouses.fCountry")}>
          {(props) => (
            <Input {...props} value={values.country} onChange={(e) => set("country", e.target.value)} />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("admin.warehouses.fContactName")}>
          {(props) => (
            <Input
              {...props}
              value={values.contactName}
              onChange={(e) => set("contactName", e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t("admin.warehouses.fContactEmail")} error={fieldErrors.contactEmail}>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={values.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
            />
          )}
        </FormField>
      </div>
    </FormDialog>
  );
}
