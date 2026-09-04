"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Callout, KeyValueRow, StatusBadge, Surface } from "@/components/ds";
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

import { priorityTone } from "./tickets-table";

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
        className="inline-flex items-center gap-1.5 text-(length:--fs-body-sm) text-(--text-muted) hover:text-(--text-body)"
      >
        <ArrowLeft className="size-4" />
        {t("support.tickets.detail.back")}
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <ol className="flex flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble
                key={`${message.id}-${message.createdAt}`}
                message={message}
                fromAuthor={message.author.id === ticket.author.id}
              />
            ))}
            {messages.length === 1 && !ticket.description && (
              <li className="text-(length:--fs-body-sm) text-(--text-muted)">
                {t("support.tickets.detail.empty")}
              </li>
            )}
          </ol>

          {closed ? (
            <Callout
              tone="info"
              title={t("support.tickets.detail.closed")}
              action={
                <Button
                  variant="outline"
                  disabled={statusPending}
                  onClick={() => submitStatus("OPEN")}
                >
                  {t("support.tickets.detail.reopen")}
                </Button>
              }
            >
              {t("support.tickets.detail.closedHint")}
            </Callout>
          ) : (
            <ReplyBox ticketId={ticket.id} />
          )}
        </div>

        <Surface className="w-full shrink-0 lg:sticky lg:top-24 lg:w-72" radius="card" shadow="xs">
          <div className="mb-2 flex flex-col gap-1.5">
            <span className="font-sans text-(length:--fs-meta) font-bold tracking-(--ls-caps) uppercase text-(--text-label)">
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

          {/* PRIORITY IS NOT A STATUS. Explicit tone, never toneFor(): the
              status map deliberately excludes TicketPriority, and routing
              URGENT through it would render it grey. */}
          <dl>
            <KeyValueRow
              label={t("support.tickets.detail.priority")}
              value={
                <StatusBadge
                  status={ticket.priority}
                  tone={priorityTone(ticket.priority)}
                  dot={false}
                >
                  {t(`support.tickets.priority.${ticket.priority}`)}
                </StatusBadge>
              }
            />

            {ticket.reason && (
              <KeyValueRow
                label={t("support.tickets.detail.reason")}
                value={t(`support.tickets.reason.${ticket.reason}`)}
              />
            )}

            <KeyValueRow label={t("support.tickets.detail.customer")} value={ticket.author.name} />

            {ticket.order && (
              <KeyValueRow
                label={t("support.tickets.detail.order")}
                mono
                value={
                  <Link
                    href={`/orders?q=${encodeURIComponent(ticket.order.label)}`}
                    className="text-(--text-link) underline-offset-2 hover:underline"
                  >
                    {ticket.order.label}
                  </Link>
                }
              />
            )}

            <KeyValueRow
              label={t("support.tickets.detail.created")}
              value={new Date(ticket.createdAt).toLocaleString()}
            />

            <KeyValueRow
              label={t("support.tickets.detail.replies")}
              mono
              value={ticket.replies.length}
            />
          </dl>
        </Surface>
      </div>
    </>
  );
}

/** Staff answers align right, the warehouse's messages left — the shape support
 * reads a thread by without having to check the names. */
function MessageBubble({ message, fromAuthor }: { message: Message; fromAuthor: boolean }) {
  const { t } = useTranslation();
  if (!message.content && message.attachments.length === 0) return null;

  return (
    <li className={`flex flex-col gap-1 ${fromAuthor ? "items-start" : "items-end"}`}>
      <span className="text-(length:--fs-meta) text-(--text-muted)">
        {fromAuthor ? message.author.name : t("support.tickets.detail.staff")} ·{" "}
        <time className="font-mono tracking-(--ls-mono)">
          {new Date(message.createdAt).toLocaleString()}
        </time>
      </span>
      {/* The two sides are two SURFACES, not a white bubble and an Action Blue
          one: the DS allows Action Blue once per region, and a thread of ten
          staff replies would spend it ten times. */}
      <Surface
        level={fromAuthor ? "data" : "inset"}
        radius="card"
        shadow={fromAuthor ? "xs" : "none"}
        pad={false}
        className="max-w-[85%] px-3 py-2 text-(length:--fs-body-sm) whitespace-pre-wrap"
      >
        {message.content}
      </Surface>
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.attachments.map((file) => (
            <a
              key={file.url}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="block size-20 overflow-hidden rounded-(--radius-xs) bg-(--surface-content) transition-shadow hover:shadow-(--shadow-sm)"
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
    <Surface radius="card" shadow="xs" pad={false} className="flex flex-col gap-2 p-3">
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
              className="flex items-center gap-1 rounded-(--radius-pill) bg-(--surface-inset) px-2 py-1 text-(length:--fs-meta) text-(--text-muted)"
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
        <p role="alert" className="text-(length:--fs-body-sm) text-(--status-critical-fg)">
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
            variant="ghost"
            size="icon-sm"
            aria-label={t("support.tickets.form.attach")}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <span className="text-(length:--fs-meta) text-(--text-muted)">
            {t("support.tickets.detail.sendHint")}
          </span>
        </div>
        <Button disabled={pending || (!content.trim() && files.length === 0)} onClick={send}>
          {t("support.tickets.detail.send")}
        </Button>
      </div>
    </Surface>
  );
}
