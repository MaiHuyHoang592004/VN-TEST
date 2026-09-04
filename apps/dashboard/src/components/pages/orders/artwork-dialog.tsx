"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";

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
  mockupUrl,
  open,
  onOpenChange,
}: {
  orderId: number;
  label: string;
  designUrl: string | null;
  /** The mockup already on the order. Shown as a preview but deliberately NOT
   * prefilled into the field: saving it back would create a second Mockup row
   * holding the same URL, and the point of showing it is that you can see what
   * you are about to replace. */
  mockupUrl: string | null;
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
            <ArtworkPreview file={designFile} url={design} current={designUrl} />
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
                variant="outline"
                size="sm"
                onClick={() => designInput.current?.click()}
              >
                {t("orders.artwork.upload")}
              </Button>
              {designFile && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDesignFile(null)}>
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
            <ArtworkPreview file={mockupFile} url={mockup} current={mockupUrl} />
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
                variant="outline"
                size="sm"
                onClick={() => mockupInput.current?.click()}
              >
                {t("orders.artwork.upload")}
              </Button>
              {mockupFile && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setMockupFile(null)}>
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

/**
 * The slot's current picture, in a CREAM well — the DS's rule for product and
 * artwork imagery, never a grey one.
 *
 * Precedence is what the SAVE would use: a chosen file wins over a typed URL,
 * and a typed URL wins over whatever is already on the order. So the preview
 * always answers "what will this slot hold when I press Save", not merely
 * "what does it hold now".
 */
function ArtworkPreview({
  file,
  url,
  current,
}: {
  file: File | null;
  url: string;
  current: string | null;
}) {
  const { t } = useTranslation();
  // Derived, not stored: a state-setting effect here would be a cascading
  // render, and the URL is a pure function of the file.
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // The effect exists only to REVOKE. A dialog reopened a dozen times would
  // otherwise pin a dozen images in memory for the life of the tab.
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const src = objectUrl ?? (url.trim() || current || null);

  // The src that failed, not a boolean: a new src then gets its own chance to
  // load, instead of one typo'd URL leaving the well permanently broken.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = src !== null && brokenSrc === src;

  return (
    <div className="flex h-50 items-center justify-center overflow-hidden rounded-(--radius-card) bg-(--surface-content)">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={t("orders.artwork.previewAlt")}
          onError={() => setBrokenSrc(src)}
          className="size-full object-contain"
        />
      ) : (
        <span className="flex flex-col items-center gap-2 text-(length:--fs-meta) text-(--text-muted)">
          <ImageOff className="size-5 stroke-(--icon-muted)" />
          {t(broken ? "orders.artwork.previewBroken" : "orders.artwork.previewNone")}
        </span>
      )}
    </div>
  );
}
