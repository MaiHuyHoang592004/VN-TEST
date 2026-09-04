"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

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
import { StatTiles } from "@/components/pages/inventory/stat-tiles";
import { useTranslation } from "@/lib/i18n";
import { deleteVendorAction } from "@/modules/finance/vendors/actions";

import { VendorDialog } from "./vendor-dialog";
import { StatusBadge } from "@/components/ds";

export type VendorRow = {
  id: number;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  note: string | null;
  status: string;
  updatedAt: string;
  /** Receipts + expenses pointing at this vendor. Non-zero means delete
   * deactivates instead — the dialog says so before it happens. */
  usage: number;
};

export function VendorsTable({
  rows,
  total,
  tiles,
}: {
  rows: VendorRow[];
  total: number;
  /** Server-counted over the whole table, never summed from `rows`. */
  tiles: { total: number; active: number; inactive: number };
}) {
  const params = useTableParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [creating, setCreating] = useState(false);

  const status = params.get("status");
  const hasFilters = Boolean(params.get("q") || status);

  const remove = async (vendor: VendorRow) => {
    if (!window.confirm(t(vendor.usage > 0 ? "finance.vendors.deactivateConfirm" : "finance.vendors.deleteConfirm"))) {
      return;
    }
    const result = await deleteVendorAction(vendor.id);
    // The service decides which of the two happened; the toast reports what it
    // did rather than what was clicked.
    toast.success(t(result.deactivated ? "finance.vendors.deactivated" : "finance.vendors.deleted"));
    router.refresh();
  };

  const columns: Column<VendorRow>[] = [
    {
      id: "code",
      header: t("finance.vendors.colCode"),
      cell: (v) => <span className="font-mono text-xs font-medium">{v.code}</span>,
    },
    {
      id: "name",
      header: t("finance.vendors.colVendor"),
      cell: (v) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{v.name}</p>
          {v.taxCode && (
            <p className="text-muted-foreground truncate font-mono text-xs">{v.taxCode}</p>
          )}
        </div>
      ),
    },
    {
      id: "contact",
      header: t("finance.vendors.colContact"),
      hideOnMobile: true,
      cell: (v) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{v.contactName ?? "—"}</p>
          <p className="text-muted-foreground truncate text-xs">
            {[v.phone, v.email].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      id: "address",
      header: t("finance.vendors.colAddress"),
      hideOnMobile: true,
      cell: (v) => (
        <span className="text-muted-foreground block max-w-[16rem] truncate text-sm">
          {v.address ?? "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: t("finance.vendors.colStatus"),
      cell: (v) => (
        <StatusBadge status={v.status}>
          {t(`finance.vendors.status.${v.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: "updatedAt",
      header: t("finance.vendors.colUpdated"),
      hideOnMobile: true,
      cell: (v) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {new Date(v.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-20",
      cell: (v) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("admin.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(v);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("admin.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              void remove(v);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <StatTiles
        tiles={[
          { label: t("finance.vendors.tiles.total"), value: tiles.total },
          { label: t("finance.vendors.tiles.active"), value: tiles.active },
          { label: t("finance.vendors.tiles.inactive"), value: tiles.inactive },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowId={(v) => String(v.id)}
        loading={params.pending}
        onRowClick={(v) => setEditing(v)}
        empty={hasFilters ? t("finance.vendors.emptyFiltered") : t("finance.vendors.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("finance.vendors.search")}
            // The page's action moves out of the hero, which owns no CTA.
            actions={<Button onClick={() => setCreating(true)}>{t("finance.vendors.new")}</Button>}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "status"])}
            filters={
              <Select
                value={status || "ALL"}
                onValueChange={(v) => params.setFilter("status", !v || v === "ALL" ? "" : v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {status
                      ? t(`finance.vendors.status.${status}`)
                      : t("finance.vendors.allStatuses")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("finance.vendors.allStatuses")}</SelectItem>
                  <SelectItem value="ACTIVE">{t("finance.vendors.status.ACTIVE")}</SelectItem>
                  <SelectItem value="INACTIVE">{t("finance.vendors.status.INACTIVE")}</SelectItem>
                </SelectContent>
              </Select>
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

      {(creating || editing) && (
        <VendorDialog
          vendor={editing ?? undefined}
          open
          onOpenChange={(o) => {
            if (o) return;
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
