"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

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
import { setVariantStatusAction } from "@/modules/catalog/variants/actions";

import { VariantDialog, type VariantRow } from "./product-dialog";
import { DeleteVariantDialog } from "./delete-product-dialog";

const STATUSES = ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;

/**
 * The smallest screen in the phase — a product is just a name, a key and a
 * status. Same shape as products deliberately: two near-identical tables are
 * easier to work on than one abstraction covering both, because the next
 * row either page needs will not be needed by the other.
 */
export function VariantsTable({ rows, total }: { rows: VariantRow[]; total: number }) {
  const params = useTableParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VariantRow | null>(null);
  const [deleting, setDeleting] = useState<VariantRow | null>(null);

  const status = params.get("status");
  const hasFilters = Boolean(params.get("q") || status);

  const toggleStatus = async (v: VariantRow) => {
    await setVariantStatusAction(v.id, v.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    router.refresh();
  };

  const columns: Column<VariantRow>[] = [
    {
      id: "name",
      header: t("catalog.variants.colName"),
      cell: (v) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{v.name}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">{v.key}</p>
        </div>
      ),
    },
    {
      id: "skus",
      header: t("catalog.variants.colSkus"),
      className: "text-right tabular-nums",
      // Not a link, unlike the products table: a product spans many products,
      // so there is no single page to send someone to.
      cell: (v) => <span className="text-muted-foreground">{v.skus}</span>,
    },
    {
      id: "status",
      header: t("catalog.variants.colStatus"),
      cell: (v) => (
        <Badge product={v.status === "ACTIVE" ? "default" : "secondary"}>
          {t(`catalog.statuses.${v.status}`)}
        </Badge>
      ),
    },
    {
      id: "updatedAt",
      header: t("catalog.variants.colUpdated"),
      hideOnMobile: true,
      cell: (v) => (
        <span className="text-muted-foreground text-sm">
          {new Date(v.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-10",
      cell: (v) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button product="ghost" size="icon" aria-label={`${t("admin.actions.for")} ${v.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <Can permission="products.manage">
              <DropdownMenuItem onClick={() => setEditing(v)}>
                {t("admin.actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleStatus(v)}>
                {t(v.status === "ACTIVE" ? "catalog.products.deactivate" : "catalog.products.activate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem product="destructive" onClick={() => setDeleting(v)}>
                {t("catalog.variants.deleteAction")}
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
        rowId={(v) => String(v.id)}
        loading={params.pending}
        empty={hasFilters ? t("catalog.variants.emptyFiltered") : t("catalog.variants.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("catalog.variants.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "status"])}
            filters={
              <Select
                value={status || "all"}
                onValueChange={(v) => params.setFilter("status", v === "all" ? "" : String(v))}
              >
                <SelectTrigger className="w-36" aria-label={t("catalog.variants.colStatus")}>
                  <SelectValue>
                    {status ? t(`catalog.statuses.${status}`) : t("catalog.products.allStatuses")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("catalog.products.allStatuses")}</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`catalog.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={
              <Can permission="products.manage">
                <Button onClick={() => setCreating(true)}>{t("catalog.variants.new")}</Button>
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

      {creating && <VariantDialog open onOpenChange={(o) => !o && setCreating(false)} />}
      {editing && (
        <VariantDialog product={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {deleting && (
        <DeleteVariantDialog
          product={deleting}
          open
          onOpenChange={(o) => !o && setDeleting(null)}
        />
      )}
    </>
  );
}
