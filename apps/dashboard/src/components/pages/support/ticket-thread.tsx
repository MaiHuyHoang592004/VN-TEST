"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Paperclip, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormAction } from "@/components/global/form";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/hooks/use-permissions";
import { replyTicketAction, setTicketStatusAction } from "@/modules/support/tickets/actions";
import { TICKET_STATUSES } from "@/modules/support/tickets/schema";

import { priorityVariant } from "./tickets-table";

type Attachment = { url: string; originalFilename: string };
type Message = {
  id: number;
  content: string;
  createdAt: string;
  attachments: Attachment[];
  author: { id: string; name: string };
};

export type TicketView = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  reason: string | null;
  createdAt: string;
  attachments: Attachment[];
  author: { id: string; name: string };
  order: { id: number; label: string } | null;
  replies: Message[];
};

/**
 * The ticket as a thread: the opening post and every reply, the author's
 * messages on one side and support's on the other.
 *
 * A CLOSED ticket replaces the composer with a banner rather than hiding it —
 * the seller can see WHY they cannot type, and reopen in one click. (The
 * server refuses closed replies regardless; this is the courtesy, not the
 * control.)
 */
export function TicketThread({ ticket }: { ticket: TicketView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = usePermissions();
  const isStaff = can("tickets.manage");
  const closed = ticket.status === "CLOSED";

  const statuses = isStaff ? TICKET_STATUSES : (["OPEN", "CLOSED"] as const);

  const { submit: submitStatus, pending: statusPending } = useFormAction({
    action: (status: string) => setTicketStatusAction(ticket.id, { status }),
    successMessage: t("support.tickets.detail.statusChanged"),
    onSuccess: () => router.refresh(),
    errorMessages: {
      "not-yours": t("support.tickets.errors.not-yours"),
      "not-found": t("support.tickets.errors.not-found"),
    },
  });

  const messages: Message[] = [
    {
      id: 0,
      content: ticket.description ?? "",
      createdAt: ticket.createdAt,
      attachments: ticket.attachments,
      author: ticket.author,
    },
    ...ticket.replies,
  ];

  return (
    <>
      <Link
        href="/tickets"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        {t("support.tickets.detail.back")}
      </Link>

      <div className="flex flex-col gap-6 lg:flex-column lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.title}</h1>

          <ol className="flex flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble
                key={`${message.id}-${message.createdAt}`}
                message={message}
                fromAuthor={message.author.id === ticket.author.id}
              />
            ))}
            {messages.length === 1 && !ticket.description && (
              <li className="text-muted-foreground text-sm">{t("support.tickets.detail.empty")}</li>
            )}
          </ol>

          {closed ? (
            <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div className="flex flex-col">
                <p className="text-sm font-medium">{t("support.tickets.detail.closed")}</p>
                <p className="text-muted-foreground text-xs">
                  {t("support.tickets.detail.closedHint")}
                </p>
              </div>
              <Button
                product="outline"
                disabled={statusPending}
                onClick={() => submitStatus("OPEN")}
              >
                {t("support.tickets.detail.reopen")}
              </Button>
            </div>
          ) : (
            <ReplyBox ticketId={ticket.id} />
          )}
        </div>

        <aside className="border-border flex w-full shrink-0 flex-col gap-4 rounded-lg border p-4 lg:sticky lg:top-24 lg:w-72">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {t("support.tickets.detail.status")}
            </span>
            <Select
              value={ticket.status}
              onValueChange={(v) => v && v !== ticket.status && submitStatus(v)}
              disabled={statusPending}
            >
              <SelectTrigger>
                <SelectValue>{t(`support.tickets.status.${ticket.status}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`support.tickets.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Field label={t("support.tickets.detail.priority")}>
            <Badge product={priorityVariant(ticket.priority)}>
              {t(`support.tickets.priority.${ticket.priority}`)}
            </Badge>
          </Field>

          {ticket.reason && (
            <Field label={t("support.tickets.detail.reason")}>
              <span className="text-sm">{t(`support.tickets.reason.${ticket.reason}`)}</span>
            </Field>
          )}

          <Field label={t("support.tickets.detail.warehouse")}>
            <span className="text-sm">{ticket.author.name}</span>
          </Field>

          {ticket.order && (
            <Field label={t("support.tickets.detail.order")}>
              <Link
                href={`/orders?q=${encodeURIComponent(ticket.order.label)}`}
                className="font-mono text-sm underline-offset-2 hover:underline"
              >
                {ticket.order.label}
              </Link>
            </Field>
          )}

          <Field label={t("support.tickets.detail.created")}>
            <span className="text-sm">{new Date(ticket.createdAt).toLocaleString()}</span>
          </Field>

          <Field label={t("support.tickets.detail.replies")}>
            <span className="text-sm tabular-nums">{ticket.replies.length}</span>
          </Field>
        </aside>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

/** Staff answers align right, the warehouse's messages left — the shape support
 * reads a thread by without having to check the names. */
function MessageBubble({ message, fromAuthor }: { message: Message; fromAuthor: boolean }) {
  const { t } = useTranslation();
  if (!message.content && message.attachments.length === 0) return null;

  return (
    <li className={`flex flex-col gap-1 ${fromAuthor ? "items-start" : "items-end"}`}>
      <span className="text-muted-foreground text-xs">
        {fromAuthor ? message.author.name : t("support.tickets.detail.staff")} ·{" "}
        {new Date(message.createdAt).toLocaleString()}
      </span>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          fromAuthor ? "bg-muted" : "bg-primary text-primary-foreground"
        }`}
      >
        {message.content}
      </div>
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.attachments.map((file) => (
            <a
              key={file.url}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="border-border hover:border-foreground/30 block size-20 overflow-hidden rounded border transition-colors"
            >
              {/* Plain <img>: user uploads on arbitrary storage hosts, which
                  next/image would need configuring per domain. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.url} alt={file.originalFilename} className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

function ReplyBox({ ticketId }: { ticketId: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const { submit, pending, formError } = useFormAction({
    action: (formData: FormData) => replyTicketAction(formData),
    successMessage: t("support.tickets.detail.sent"),
    onSuccess: () => {
      setContent("");
      setFiles([]);
      router.refresh();
    },
    errorMessages: {
      "ticket-closed": t("support.tickets.errors.ticket-closed"),
      "not-found": t("support.tickets.errors.not-found"),
      "file-too-large": t("support.tickets.errors.file-too-large"),
      "not-an-image": t("support.tickets.errors.not-an-image"),
      "too-many-files": t("support.tickets.errors.too-many-files"),
      "storage-not-configured": t("support.tickets.errors.storage-not-configured"),
    },
  });

  const send = () => {
    if (!content.trim() && files.length === 0) return;
    const formData = new FormData();
    formData.set("ticketId", String(ticketId));
    formData.set("content", content);
    for (const file of files) formData.append("files", file);
    submit(formData);
  };

  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
      <Textarea
        rows={3}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t("support.tickets.detail.replyPlaceholder")}
        // Ctrl/Cmd+Enter sends; plain Enter keeps writing a paragraph. A
        // support reply is prose, not a chat one-liner.
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            send();
          }
        }}
      />

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

      {formError && (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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
            product="ghost"
            size="icon"
            aria-label={t("support.tickets.form.attach")}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <span className="text-muted-foreground text-xs">
            {t("support.tickets.detail.sendHint")}
          </span>
        </div>
        <Button disabled={pending || (!content.trim() && files.length === 0)} onClick={send}>
          {t("support.tickets.detail.send")}
        </Button>
      </div>
    </div>
  );
}
