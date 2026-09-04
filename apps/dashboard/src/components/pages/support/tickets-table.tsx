"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  useTableParams,
  type Column,
} from "@/components/global/data-table";
import { Can } from "@/components/global/permission-gate";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";
import { deleteTicketAction } from "@/modules/support/tickets/actions";
import { TICKET_PRIORITIES, TICKET_REASONS, TICKET_STATUSES } from "@/modules/support/tickets/schema";

import { TicketFormDialog, type OrderOption } from "./ticket-form-dialog";

export type TicketRowView = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  reason: string | null;
  replyCount: number;
  createdAt: string;
  author: string;
  order: { id: number; label: string } | null;
};

/**
 * Status and priority read as colour before they read as words, so the two
 * badges answer "is anyone waiting on me?" from across the room.
 *
 * STATUS comes from STATUS_TONES via the raw value — there is no local status
 * colour here any more, which is the drift the DS's map exists to end.
 *
 * PRIORITY does not, and must never: `status-tones.ts` records that
 * TicketPriority is a priority and not a status, and that routing it through
 * toneFor() would silently render URGENT grey. It gets an explicit tone
 * instead. Four levels, three tones — the same collapse the old
 * `priorityVariant` made, because the schema's LOW and MEDIUM were already one
 * appearance and inventing a fourth would be inventing a level.
 */
export const PRIORITY_TONES: Record<string, StatusTone> = {
  URGENT: "critical",
  HIGH: "attention",
  MEDIUM: "neutral",
  LOW: "neutral",
};

export const priorityTone = (priority: string): StatusTone =>
  PRIORITY_TONES[priority] ?? "neutral";

export function TicketsTable({
  rows,
  total,
  orders,
}: {
  rows: TicketRowView[];
  total: number;
  orders: OrderOption[];
}) {
  const params = useTableParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TicketRowView | null>(null);
  // Which row is mid-delete. Without it the second click of an impatient
  // double-click fires the action again against a row that is already gone.
  const [deleting, setDeleting] = useState<number | null>(null);

  const hasFilters = Boolean(
    params.get("q") || params.get("status") || params.get("priority") || params.get("reason"),
  );

  const columns: Column<TicketRowView>[] = [
    {
      id: "title",
      header: t("support.tickets.col.title"),
      cell: (r) => (
        <span className="font-sans text-(length:--fs-body-sm) font-semibold text-(--text-body)">
          {r.title}
        </span>
      ),
    },
    {
      id: "author",
      header: t("support.tickets.col.author"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">{r.author}</span>
      ),
    },
    {
      id: "status",
      header: t("support.tickets.col.status"),
      cell: (r) => (
        <StatusBadge status={r.status}>{t(`support.tickets.status.${r.status}`)}</StatusBadge>
      ),
    },
    {
      id: "priority",
      header: t("support.tickets.col.priority"),
      cell: (r) => (
        <StatusBadge status={r.priority} tone={priorityTone(r.priority)} dot={false}>
          {t(`support.tickets.priority.${r.priority}`)}
        </StatusBadge>
      ),
    },
    {
      id: "order",
      header: t("support.tickets.col.order"),
      hideOnMobile: true,
      cell: (r) =>
        r.order ? (
          // stopPropagation: the column itself opens the ticket, and a link inside
          // a clickable column otherwise navigates twice.
          <Link
            href={`/orders?q=${encodeURIComponent(r.order.label)}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-(length:--fs-meta) tracking-(--ls-mono) text-(--text-link) underline-offset-2 hover:underline"
          >
            {r.order.label}
          </Link>
        ) : (
          <span className="text-(--text-muted)">—</span>
        ),
    },
    {
      id: "reason",
      header: t("support.tickets.col.reason"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">
          {r.reason ? t(`support.tickets.reason.${r.reason}`) : "—"}
        </span>
      ),
    },
    {
      id: "replies",
      header: t("support.tickets.col.replies"),
      className: "text-right tabular-nums",
      cell: (r) => (
        <span className="font-mono text-(length:--fs-body-sm) tracking-(--ls-mono)">
          {r.replyCount}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: t("support.tickets.col.created"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-(length:--fs-body-sm) whitespace-nowrap text-(--text-muted)">
          {new Date(r.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      className: "w-20",
      cell: (r) => (
        <div className="flex justify-end">
          {/* Shown to everyone: a seller only ever sees their own rows, and the
              server refuses an edit that is not theirs to make. */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("support.tickets.edit.title")}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(r);
            }}
          >
            <Pencil className="size-4" />
          </Button>
        <Can permission="tickets.manage">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("support.tickets.delete.submit")}
            disabled={deleting === r.id}
            onClick={async (e) => {
              e.stopPropagation();
              if (deleting !== null) return;
              if (!window.confirm(t("support.tickets.delete.body"))) return;
              setDeleting(r.id);
              try {
                // Two failure shapes: the guard turns a domain refusal into
                // `{ ok: false }`, everything else throws. Neither said
                // anything before — the row just sat there and the user's read
                // was "the button is broken".
                const result = await deleteTicketAction(r.id);
                if (result && result.ok === false) {
                  const code = result.error ?? "";
                  toast.error(
                    code === "not-yours"
                      ? t("support.tickets.errors.not-yours")
                      : code === "not-found"
                        ? t("support.tickets.errors.not-found")
                        : t("support.tickets.delete.failed"),
                  );
                  return;
                }
              } catch {
                toast.error(t("support.tickets.delete.failed"));
                return;
              } finally {
                setDeleting(null);
              }
              toast.success(t("support.tickets.delete.deleted"));
              router.refresh();
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </Can>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={params.pending}
        onRowClick={(r) => router.push(`/tickets/${r.id}`)}
        empty={hasFilters ? t("support.tickets.emptyFiltered") : t("support.tickets.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("support.tickets.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "status", "priority", "reason"])}
            // The page's one primary action. It used to sit beside the h1; the
            // DS's operational hero owns no CTA, and this toolbar is the slot
            // the hero deliberately does not provide.
            actions={<Button onClick={() => setCreating(true)}>{t("support.tickets.new")}</Button>}
            filters={
              <>
                <Select
                  value={params.get("status") || "ALL"}
                  onValueChange={(v) => params.setFilter("status", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-40" aria-label={t("support.tickets.col.status")}>
                    <SelectValue>
                      {params.get("status")
                        ? t(`support.tickets.status.${params.get("status")}`)
                        : t("support.tickets.allStatuses")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("support.tickets.allStatuses")}</SelectItem>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`support.tickets.status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={params.get("priority") || "ALL"}
                  onValueChange={(v) => params.setFilter("priority", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-36" aria-label={t("support.tickets.col.priority")}>
                    <SelectValue>
                      {params.get("priority")
                        ? t(`support.tickets.priority.${params.get("priority")}`)
                        : t("support.tickets.allPriorities")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("support.tickets.allPriorities")}</SelectItem>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`support.tickets.priority.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={params.get("reason") || "ALL"}
                  onValueChange={(v) => params.setFilter("reason", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-48" aria-label={t("support.tickets.col.reason")}>
                    <SelectValue>
                      {params.get("reason")
                        ? t(`support.tickets.reason.${params.get("reason")}`)
                        : t("support.tickets.allReasons")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("support.tickets.allReasons")}</SelectItem>
                    {TICKET_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`support.tickets.reason.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
          />
        }
        footer={
          <DataTablePagination
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            onPageChange={params.setPage}
            onPageSizeChange={params.setPageSize}
          />
        }
      />

      {creating && (
        <TicketFormDialog orders={orders} open onOpenChange={(o) => !o && setCreating(false)} />
      )}
      {editing && (
        <TicketFormDialog
          orders={orders}
          ticket={{
            id: editing.id,
            title: editing.title,
            description: editing.description,
            reason: editing.reason,
            priority: editing.priority,
          }}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}
