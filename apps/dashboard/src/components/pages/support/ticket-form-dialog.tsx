"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { createTicketAction, updateTicketAction } from "@/modules/support/tickets/actions";
import {
  REASON_PRIORITY,
  TICKET_PRIORITIES,
  TICKET_REASONS,
  type TicketReason,
} from "@/modules/support/tickets/schema";

export type OrderOption = { id: number; label: string };

/** The fields an existing ticket exposes for editing — the opening post only;
 * replies are never rewritten, or the thread stops being a record. */
export type EditableTicket = {
  id: number;
  title: string;
  description: string | null;
  reason: string | null;
  priority: string;
};

const NO_ORDER = "NONE";

/**
 * Opening a ticket.
 *
 * The reason PRE-FILLS the priority and leaves it editable — legacy auto-filled
 * it and disabled the field, so a seller who knew their case was urgent had no
 * way to say so. The server takes whatever is submitted.
 */
export function TicketFormDialog({
  orders,
  ticket,
  open,
  onOpenChange,
}: {
  orders: OrderOption[];
  /** Omit to create. Editing covers title, reason, priority and description —
   * the order link and attachments are part of what was filed. */
  ticket?: EditableTicket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);

  const initialReason = (ticket?.reason ?? "wrong-item") as TicketReason;
  const [title, setTitle] = useState(ticket?.title ?? "");
  const [reason, setReason] = useState<TicketReason>(initialReason);
  const [priority, setPriority] = useState<string>(ticket?.priority ?? REASON_PRIORITY[initialReason]);
  const [orderId, setOrderId] = useState(NO_ORDER);
  const [description, setDescription] = useState(ticket?.description ?? "");
  const [files, setFiles] = useState<File[]>([]);

  const { submit, pending, fieldErrors, formError } = useFormAction({
    action: async (formData: FormData) => {
      if (ticket) {
        return updateTicketAction(ticket.id, {
          title: formData.get("title"),
          description: formData.get("description"),
          reason: formData.get("reason"),
          priority: formData.get("priority"),
        });
      }
      const result = await createTicketAction(formData);
      // The server drops an order reference it cannot verify — and SAYS so.
      // Legacy dropped it silently, which is how a ticket ends up about
      // nothing in particular.
      if (result && "droppedOrder" in result && result.droppedOrder) {
        toast.warning(t("support.tickets.form.orderDropped"));
      }
      return result;
    },
    successMessage: ticket ? t("support.tickets.edit.saved") : t("support.tickets.form.created"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
    errorMessages: {
      "not-yours": t("support.tickets.errors.not-yours"),
      "ticket-closed": t("support.tickets.errors.ticket-closed"),
      "not-found": t("support.tickets.errors.not-found"),
      "file-too-large": t("support.tickets.errors.file-too-large"),
      "not-an-image": t("support.tickets.errors.not-an-image"),
      "too-many-files": t("support.tickets.errors.too-many-files"),
      "storage-not-configured": t("support.tickets.errors.storage-not-configured"),
    },
  });

  const onSubmit = () => {
    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("reason", reason);
    formData.set("priority", priority);
    if (orderId !== NO_ORDER) formData.set("orderId", orderId);
    for (const file of files) formData.append("files", file);
    submit(formData);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={ticket ? t("support.tickets.edit.title") : t("support.tickets.form.new")}
      description={ticket ? undefined : t("support.tickets.form.description")}
      submitLabel={ticket ? t("support.tickets.edit.submit") : t("support.tickets.form.submit")}
      pending={pending}
      formError={formError}
      onSubmit={onSubmit}
    >
      <FormField label={t("support.tickets.form.title")} required error={fieldErrors.title}>
        {(props) => (
          <Input
            {...props}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("support.tickets.form.titlePlaceholder")}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("support.tickets.form.reason")} error={fieldErrors.reason}>
          {() => (
            <Select
              value={reason}
              onValueChange={(v) => {
                const next = (v || "other") as TicketReason;
                setReason(next);
                setPriority(REASON_PRIORITY[next]);
              }}
            >
              <SelectTrigger>
                <SelectValue>{t(`support.tickets.reason.${reason}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TICKET_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`support.tickets.reason.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField
          label={t("support.tickets.form.priority")}
          hint={t("support.tickets.form.priorityHint")}
          error={fieldErrors.priority}
        >
          {() => (
            <Select value={priority} onValueChange={(v) => setPriority(v || "MEDIUM")}>
              <SelectTrigger>
                <SelectValue>{t(`support.tickets.priority.${priority}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`support.tickets.priority.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </div>

      {!ticket && (
      <FormField label={t("support.tickets.form.order")} error={fieldErrors.orderId}>
        {() => (
          <Select value={orderId} onValueChange={(v) => setOrderId(v || NO_ORDER)}>
            <SelectTrigger>
              <SelectValue>
                {orders.find((o) => String(o.id) === orderId)?.label ??
                  t("support.tickets.form.orderNone")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ORDER}>{t("support.tickets.form.orderNone")}</SelectItem>
              {orders.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      )}

      <FormField label={t("support.tickets.form.body")} error={fieldErrors.description}>
        {(props) => (
          <Textarea
            {...props}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("support.tickets.form.bodyPlaceholder")}
          />
        )}
      </FormField>

      {!ticket && (
      <FormField label={t("support.tickets.form.attach")} hint={t("support.tickets.form.attachHint")}>
        {() => (
          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                setFiles((f) => [...f, ...Array.from(e.target.files ?? [])].slice(0, 10));
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => fileInput.current?.click()}
            >
              {t("support.tickets.form.attach")}
            </Button>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="border-border text-muted-foreground flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                  >
                    {file.name}
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setFiles((f) => f.filter((_, i) => i !== index))}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </FormField>
      )}
    </FormDialog>
  );
}
