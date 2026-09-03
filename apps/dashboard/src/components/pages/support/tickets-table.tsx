"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/** Status and priority read as colour before they read as words, so the two
 * badges answer "is anyone waiting on me?" from across the room. */
export const statusVariant = (status: string) =>
  status === "CLOSED" ? "outline" : status === "RESOLVED" ? "default" : "secondary";

export const priorityVariant = (priority: string) =>
  priority === "URGENT" ? "destructive" : priority === "HIGH" ? "default" : "secondary";

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

  const hasFilters = Boolean(
    params.get("q") || params.get("status") || params.get("priority") || params.get("reason"),
  );

  const columns: Column<TicketRowView>[] = [
    {
      id: "title",
      header: t("support.tickets.col.title"),
      cell: (r) => <span className="font-medium">{r.title}</span>,
    },
    {
      id: "author",
      header: t("support.tickets.col.author"),
      hideOnMobile: true,
      cell: (r) => <span className="text-muted-foreground text-sm">{r.author}</span>,
    },
    {
      id: "status",
      header: t("support.tickets.col.status"),
      cell: (r) => (
        <Badge product={statusVariant(r.status)}>{t(`support.tickets.status.${r.status}`)}</Badge>
      ),
    },
    {
      id: "priority",
      header: t("support.tickets.col.priority"),
      cell: (r) => (
        <Badge product={priorityVariant(r.priority)}>
          {t(`support.tickets.priority.${r.priority}`)}
        </Badge>
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
            className="font-mono text-xs underline-offset-2 hover:underline"
          >
            {r.order.label}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "reason",
      header: t("support.tickets.col.reason"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-muted-foreground text-sm">
          {r.reason ? t(`support.tickets.reason.${r.reason}`) : "—"}
        </span>
      ),
    },
    {
      id: "replies",
      header: t("support.tickets.col.replies"),
      className: "text-right tabular-nums",
      cell: (r) => r.replyCount,
    },
    {
      id: "createdAt",
      header: t("support.tickets.col.created"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
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
            product="ghost"
            size="icon"
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
            product="ghost"
            size="icon"
            aria-label={t("support.tickets.delete.submit")}
            onClick={async (e) => {
              e.stopPropagation();
              if (!window.confirm(t("support.tickets.delete.body"))) return;
              await deleteTicketAction(r.id);
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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("support.tickets.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("support.tickets.subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t("support.tickets.new")}</Button>
      </div>

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
            filters={
              <>
                <Select
                  value={params.get("status") || "ALL"}
                  onValueChange={(v) => params.setFilter("status", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-40">
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
                  <SelectTrigger className="w-36">
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
                  <SelectTrigger className="w-48">
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
