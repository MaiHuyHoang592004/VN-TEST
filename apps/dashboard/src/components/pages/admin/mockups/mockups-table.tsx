"use client";

import { useState } from "react";
import { MoreHorizontal, Image as ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useTranslation } from "@/lib/i18n";

import { MockupDialog, type MockupRow } from "./mockup-dialog";
import { DeleteMockupDialog } from "./delete-mockup-dialog";

const STATUSES = ["active", "inactive"] as const;

export function MockupsTable({ rows, total }: { rows: MockupRow[]; total: number }) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MockupRow | null>(null);
  const [deleting, setDeleting] = useState<MockupRow | null>(null);

  const status = params.get("status");
  const hasFilters = Boolean(params.get("q") || status);

  const columns: Column<MockupRow>[] = [
    {
      id: "name",
      header: t("catalog.mockups.colName"),
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          {/* Plain <img>: artwork lives on Drive and other arbitrary hosts,
              which next/image would need every one of allow-listed. */}
          {m.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.thumbnail}
              alt=""
              className="border-border size-8 shrink-0 rounded-md border object-cover"
            />
          ) : (
            <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
              <ImageIcon className="size-4" />
            </span>
          )}
          <p className="truncate text-sm font-medium">{m.name}</p>
        </div>
      ),
    },
    {
      id: "url",
      header: t("catalog.mockups.colUrl"),
      hideOnMobile: true,
      cell: (m) => (
        <a
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground block max-w-[22rem] truncate text-sm underline-offset-4 hover:underline"
        >
          {m.url}
        </a>
      ),
    },
    {
      id: "orders",
      header: t("catalog.mockups.colOrders"),
      className: "text-right tabular-nums",
      cell: (m) => <span className="text-muted-foreground">{m.orders}</span>,
    },
    {
      id: "status",
      header: t("catalog.mockups.colStatus"),
      cell: (m) => (
        <Badge product={m.status === "active" ? "default" : "secondary"}>
          {t(`catalog.mockupStatuses.${m.status}`)}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-10",
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button product="ghost" size="icon" aria-label={`${t("admin.actions.for")} ${m.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <Can permission="mockups.manage">
              <DropdownMenuItem onClick={() => setEditing(m)}>
                {t("admin.actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem product="destructive" onClick={() => setDeleting(m)}>
                {t("catalog.mockups.deleteAction")}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(m) => String(m.id)}
        loading={params.pending}
        empty={hasFilters ? t("catalog.mockups.emptyFiltered") : t("catalog.mockups.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("catalog.mockups.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "status"])}
            filters={
              <Select
                value={status || "all"}
                onValueChange={(v) => params.setFilter("status", v === "all" ? "" : String(v))}
              >
                <SelectTrigger className="w-36" aria-label={t("catalog.mockups.colStatus")}>
                  <SelectValue>
                    {status
                      ? t(`catalog.mockupStatuses.${status}`)
                      : t("catalog.products.allStatuses")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("catalog.products.allStatuses")}</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`catalog.mockupStatuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={
              <Can permission="mockups.manage">
                <Button onClick={() => setCreating(true)}>{t("catalog.mockups.new")}</Button>
              </Can>
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

      {creating && <MockupDialog open onOpenChange={(o) => !o && setCreating(false)} />}
      {editing && (
        <MockupDialog mockup={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {deleting && (
        <DeleteMockupDialog
          mockup={deleting}
          open
          onOpenChange={(o) => !o && setDeleting(null)}
        />
      )}
    </>
  );
}
