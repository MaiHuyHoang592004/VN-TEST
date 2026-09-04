"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, DataTableToolbar, useTableParams, type Column } from "@/components/global/data-table";
import { Can } from "@/components/global/permission-gate";
import { useTranslation } from "@/lib/i18n";

import { WarehouseDialog, type WarehouseRow } from "./warehouse-dialog";
import { DeleteWarehouseDialog } from "./delete-warehouse-dialog";
import { WarehouseMembersDialog } from "./warehouse-members-dialog";
import { StatusBadge } from "@/components/ds";

export function WarehousesTable({ rows }: { rows: WarehouseRow[] }) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [deleting, setDeleting] = useState<WarehouseRow | null>(null);
  const [members, setMembers] = useState<WarehouseRow | null>(null);

  const q = params.get("q").toLowerCase();
  // Client-side filter: warehouses are a short list (tens, not thousands), so
  // a round-trip per keystroke would be slower and no more correct.
  const filtered = q
    ? rows.filter((w) =>
        [w.code, w.name, w.region, w.city].some((v) => v?.toLowerCase().includes(q)),
      )
    : rows;

  const columns: Column<WarehouseRow>[] = [
    {
      id: "code",
      header: t("admin.warehouses.colCode"),
      cell: (w) => <span className="font-mono text-xs">{w.code}</span>,
    },
    {
      id: "name",
      header: t("admin.warehouses.colName"),
      cell: (w) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{w.name}</p>
          {w.description && (
            <p className="text-muted-foreground truncate text-xs">{w.description}</p>
          )}
        </div>
      ),
    },
    {
      id: "region",
      header: t("admin.warehouses.colRegion"),
      hideOnMobile: true,
      cell: (w) => (
        <span className="text-muted-foreground text-sm">
          {[w.city, w.region].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
    {
      id: "members",
      header: t("admin.warehouses.colStaff"),
      className: "text-right tabular-nums",
      cell: (w) => w.members,
    },
    {
      id: "status",
      header: t("admin.warehouses.colStatus"),
      cell: (w) => (
        <StatusBadge status={w.status}>
          {t(`admin.statuses.${w.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-10",
      cell: (w) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`${t("admin.actions.for")} ${w.code}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <Can permission="warehouses.manage">
              <DropdownMenuItem onClick={() => setEditing(w)}>{t("admin.actions.edit")}</DropdownMenuItem>
            </Can>
            <Can permission="warehouses.members.manage">
              <DropdownMenuItem onClick={() => setMembers(w)}>{t("admin.warehouses.manageStaff")}</DropdownMenuItem>
            </Can>
            <Can permission="warehouses.manage">
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(w)}>
                {t("admin.warehouses.deleteAction")}
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
        rows={filtered}
        columns={columns}
        rowId={(w) => String(w.id)}
        empty={q ? t("admin.warehouses.emptyFiltered") : t("admin.warehouses.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("admin.warehouses.search")}
            hasFilters={Boolean(q)}
            onClearFilters={() => params.clearFilters(["q"])}
            actions={
              <Can permission="warehouses.manage">
                <Button onClick={() => setCreating(true)}>{t("admin.warehouses.new")}</Button>
              </Can>
            }
          />
        }
      />

      {creating && <WarehouseDialog open onOpenChange={(o) => !o && setCreating(false)} />}
      {editing && (
        <WarehouseDialog customer={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {deleting && (
        <DeleteWarehouseDialog
          customer={deleting}
          open
          onOpenChange={(o) => !o && setDeleting(null)}
        />
      )}
      {members && (
        <WarehouseMembersDialog
          customer={members}
          open
          onOpenChange={(o) => !o && setMembers(null)}
        />
      )}
    </>
  );
}
