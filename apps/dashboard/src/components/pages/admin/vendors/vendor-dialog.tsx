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
import { createVendorAction, updateVendorAction } from "@/modules/finance/vendors/actions";

import type { VendorRow } from "./vendors-table";

/**
 * Create or edit a supplier. The CODE may be left blank on create — the
 * service generates VND-1, VND-2… exactly as the legacy form did, because a
 * supplier's own reference is rarely to hand when someone is typing them in.
 */
export function VendorDialog({
  vendor,
  open,
  onOpenChange,
}: {
  vendor?: VendorRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    code: vendor?.code ?? "",
    name: vendor?.name ?? "",
    contactName: vendor?.contactName ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    address: vendor?.address ?? "",
    taxCode: vendor?.taxCode ?? "",
    note: vendor?.note ?? "",
    status: vendor?.status ?? "ACTIVE",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const { submit, pending, fieldErrors, formError } = useFormAction({
    action: (input: typeof form) =>
      vendor ? updateVendorAction(vendor.id, input) : createVendorAction(input),
    successMessage: vendor ? t("finance.vendors.saved") : t("finance.vendors.created"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
    errorMessages: { "code-taken": t("finance.vendors.errCodeTaken") },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={vendor ? t("finance.vendors.editTitle") : t("finance.vendors.newTitle")}
      description={vendor ? undefined : t("finance.vendors.newDesc")}
      submitLabel={vendor ? t("admin.actions.save") : t("finance.vendors.new")}
      pending={pending}
      submitDisabled={!form.name.trim()}
      formError={formError}
      onSubmit={() => submit(form)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("finance.vendors.fCode")}
          hint={vendor ? undefined : t("finance.vendors.fCodeHint")}
          error={fieldErrors.code}
        >
          {(props) => (
            <Input
              {...props}
              value={form.code}
              onChange={(e) => set({ code: e.target.value })}
              placeholder="VND-1"
            />
          )}
        </FormField>

        <FormField label={t("finance.vendors.fStatus")} error={fieldErrors.status}>
          {() => (
            <Select value={form.status} onValueChange={(v) => set({ status: v || "ACTIVE" })}>
              <SelectTrigger>
                <SelectValue>{t(`finance.vendors.status.${form.status}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{t("finance.vendors.status.ACTIVE")}</SelectItem>
                <SelectItem value="INACTIVE">{t("finance.vendors.status.INACTIVE")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      <FormField label={t("finance.vendors.fName")} required error={fieldErrors.name}>
        {(props) => (
          <Input {...props} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("finance.vendors.fContact")} error={fieldErrors.contactName}>
          {(props) => (
            <Input
              {...props}
              value={form.contactName}
              onChange={(e) => set({ contactName: e.target.value })}
            />
          )}
        </FormField>

        <FormField label={t("finance.vendors.fPhone")} error={fieldErrors.phone}>
          {(props) => (
            <Input {...props} value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          )}
        </FormField>

        <FormField label={t("finance.vendors.fEmail")} error={fieldErrors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          )}
        </FormField>

        <FormField label={t("finance.vendors.fTaxCode")} error={fieldErrors.taxCode}>
          {(props) => (
            <Input
              {...props}
              value={form.taxCode}
              onChange={(e) => set({ taxCode: e.target.value })}
            />
          )}
        </FormField>
      </div>

      <FormField label={t("finance.vendors.fAddress")} error={fieldErrors.address}>
        {(props) => (
          <Input
            {...props}
            value={form.address}
            onChange={(e) => set({ address: e.target.value })}
          />
        )}
      </FormField>

      <FormField label={t("finance.vendors.fNote")} error={fieldErrors.note}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        )}
      </FormField>
    </FormDialog>
  );
}
