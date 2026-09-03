"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { setOrderArtworkAction } from "@/modules/fulfillment/orders/actions";

/**
 * The legacy design modal, minus Google Drive.
 *
 * A URL or a file, per slot. No folders, no queues, no OCR — what people used
 * that modal for was "this order has the wrong picture on it", and this is
 * that. The order must still be PENDING; the service says so if it is not.
 */
export function ArtworkDialog({
  orderId,
  label,
  designUrl,
  open,
  onOpenChange,
}: {
  orderId: number;
  label: string;
  designUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const designInput = useRef<HTMLInputElement>(null);
  const mockupInput = useRef<HTMLInputElement>(null);

  const [design, setDesign] = useState(designUrl ?? "");
  const [mockup, setMockup] = useState("");
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [mockupFile, setMockupFile] = useState<File | null>(null);

  const { submit, pending, formError } = useFormAction({
    action: (formData: FormData) => setOrderArtworkAction(formData),
    successMessage: t("orders.artwork.saved"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
    errorMessages: {
      "not-editable": t("orders.artwork.errNotEditable"),
      "not-found": t("orders.artwork.errNotFound"),
      "nothing-to-set": t("orders.artwork.errNothing"),
      "file-too-large": t("support.tickets.errors.file-too-large"),
      "not-an-image": t("support.tickets.errors.not-an-image"),
      "storage-not-configured": t("support.tickets.errors.storage-not-configured"),
    },
  });

  const onSubmit = () => {
    const formData = new FormData();
    formData.set("orderId", String(orderId));
    // A file wins over a URL for its own slot: it is the more deliberate act.
    if (!designFile) formData.set("designUrl", design);
    if (!mockupFile) formData.set("mockupUrl", mockup);
    if (designFile) formData.set("designFile", designFile);
    if (mockupFile) formData.set("mockupFile", mockupFile);
    submit(formData);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("orders.artwork.title")}
      description={t("orders.artwork.description").replace("{order}", label)}
      submitLabel={t("admin.actions.save")}
      pending={pending}
      submitDisabled={!design.trim() && !mockup.trim() && !designFile && !mockupFile}
      formError={formError}
      onSubmit={onSubmit}
    >
      <FormField label={t("orders.artwork.design")} hint={t("orders.artwork.slotHint")}>
        {(props) => (
          <div className="flex flex-col gap-2">
            <Input
              {...props}
              value={designFile ? designFile.name : design}
              onChange={(e) => setDesign(e.target.value)}
              disabled={Boolean(designFile)}
              placeholder="https://…"
            />
            <input
              ref={designInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => setDesignFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                product="outline"
                size="sm"
                onClick={() => designInput.current?.click()}
              >
                {t("orders.artwork.upload")}
              </Button>
              {designFile && (
                <Button type="button" product="ghost" size="sm" onClick={() => setDesignFile(null)}>
                  {t("orders.artwork.clearFile")}
                </Button>
              )}
            </div>
          </div>
        )}
      </FormField>

      <FormField label={t("orders.artwork.mockup")} hint={t("orders.artwork.slotHint")}>
        {(props) => (
          <div className="flex flex-col gap-2">
            <Input
              {...props}
              value={mockupFile ? mockupFile.name : mockup}
              onChange={(e) => setMockup(e.target.value)}
              disabled={Boolean(mockupFile)}
              placeholder="https://…"
            />
            <input
              ref={mockupInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => setMockupFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                product="outline"
                size="sm"
                onClick={() => mockupInput.current?.click()}
              >
                {t("orders.artwork.upload")}
              </Button>
              {mockupFile && (
                <Button type="button" product="ghost" size="sm" onClick={() => setMockupFile(null)}>
                  {t("orders.artwork.clearFile")}
                </Button>
              )}
            </div>
          </div>
        )}
      </FormField>
    </FormDialog>
  );
}
