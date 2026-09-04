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

import { MaterialDialog, MATERIAL_TYPES, type MaterialRow } from "./material-dialog";
import { DeleteMaterialDialog } from "./delete-material-dialog";
import { StatusBadge } from "@/components/ds";

export function MaterialsTable({ rows, total }: { rows: MaterialRow[]; total: number }) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [deleting, setDeleting] = useState<MaterialRow | null>(null);

  // Every filter is server-side: the page reads them from the URL and queries
  // exactly the rows it renders, so a 50k-material catalogue never ships here.
  const type = params.get("type");
  const status = params.get("status") || "ACTIVE";
  const hasFilters = Boolean(params.get("q") || type || params.get("status"));

  const columns: Column<MaterialRow>[] = [
    {
      id: "name",
      header: t("inventory.materials.col.name"),
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{m.name}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">{m.sku}</p>
        </div>
      ),
    },
    {
      id: "type",
      header: t("inventory.materials.col.type"),
      hideOnMobile: true,
      cell: (m) => (
        <span className="text-muted-foreground text-sm">
          {t(`inventory.materials.types.${m.type}`)}
        </span>
      ),
    },
    {
      id: "uom",
      header: t("inventory.materials.col.uom"),
      hideOnMobile: true,
      cell: (m) => <span className="text-muted-foreground text-sm">{m.uom}</span>,
    },
    {
      id: "status",
      header: t("inventory.materials.col.status"),
      cell: (m) => (
        <StatusBadge status={m.status}>
          {t(`catalog.statuses.${m.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: "available",
      header: t("inventory.materials.col.available"),
      className: "text-right tabular-nums",
      cell: (m) => m.available,
    },
    {
      id: "bomLines",
      header: t("inventory.materials.col.bomLines"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (m) => m.bomLines,
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-10",
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("admin.actions.for")} ${m.sku}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <Can permission="suppliers.manage">
              <DropdownMenuItem onClick={() => setEditing(m)}>
                {t("admin.actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(m)}>
                {t("inventory.materials.delete.action")}
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
        empty={
          hasFilters
            ? t("inventory.materials.emptyFiltered")
            : t("inventory.materials.empty")
        }
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("inventory.materials.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "type", "status"])}
            filters={
              <>
                <Select
                  value={type || "ALL"}
                  onValueChange={(v) => params.setFilter("type", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("inventory.materials.allTypes")}</SelectItem>
                    {MATERIAL_TYPES.map((mt) => (
                      <SelectItem key={mt} value={mt}>
                        {t(`inventory.materials.types.${mt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={status} onValueChange={(v) => v && params.setFilter("status", v)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("admin.filters.allStatuses")}</SelectItem>
                    {["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`catalog.statuses.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <Can permission="suppliers.manage">
                <Button onClick={() => setCreating(true)}>
                  {t("inventory.materials.new")}
                </Button>
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

      {creating && <MaterialDialog open onOpenChange={(o) => !o && setCreating(false)} />}
      {editing && (
        <MaterialDialog material={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {deleting && (
        <DeleteMaterialDialog
          material={deleting}
          open
          onOpenChange={(o) => !o && setDeleting(null)}
        />
      )}
    </>
  );
}
