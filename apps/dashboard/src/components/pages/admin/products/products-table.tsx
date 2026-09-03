"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Package } from "lucide-react";

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
import { setProductStatusAction } from "@/modules/catalog/products/actions";

import { ProductDialog, type ProductRow } from "./variant-dialog";
import { DeleteProductDialog } from "./delete-variant-dialog";

const STATUSES = ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export function ProductsTable({ rows, total }: { rows: ProductRow[]; total: number }) {
  const params = useTableParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);

  const status = params.get("status");
  // Server-side: the page re-fetches on every filter change, so unlike the
  // warehouses screen there is no local filtering to keep in step.
  const hasFilters = Boolean(params.get("q") || status);

  const toggleStatus = async (p: ProductRow) => {
    await setProductStatusAction(p.id, p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    router.refresh();
  };

  const columns: Column<ProductRow>[] = [
    {
      id: "name",
      header: t("catalog.products.colName"),
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          {/* Plain <img>: these are arbitrary seller-supplied URLs, which
              next/image would need every host allow-listed for. */}
          {p.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.thumbnail}
              alt=""
              className="border-border size-8 shrink-0 rounded-md border object-cover"
            />
          ) : (
            <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
              <Package className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="text-muted-foreground truncate font-mono text-xs">{p.key}</p>
          </div>
        </div>
      ),
    },
    {
      id: "skus",
      header: t("catalog.products.colSkus"),
      className: "text-right tabular-nums",
      cell: (p) => (
        <Link
          href={`/admin/products/${p.id}/variants`}
          className="hover:text-foreground text-muted-foreground underline-offset-4 hover:underline"
        >
          {p.skus}
        </Link>
      ),
    },
    {
      id: "status",
      header: t("catalog.products.colStatus"),
      cell: (p) => (
        <Badge product={p.status === "ACTIVE" ? "default" : "secondary"}>
          {t(`catalog.statuses.${p.status}`)}
        </Badge>
      ),
    },
    {
      id: "updatedAt",
      header: t("catalog.products.colUpdated"),
      hideOnMobile: true,
      cell: (p) => (
        <span className="text-muted-foreground text-sm">
          {new Date(p.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-10",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button product="ghost" size="icon" aria-label={`${t("admin.actions.for")} ${p.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              render={<Link href={`/admin/products/${p.id}/variants`} />}
              nativeButton={false}
            >
              {t("catalog.products.manageVariants")}
            </DropdownMenuItem>
            <Can permission="products.manage">
              <DropdownMenuItem onClick={() => setEditing(p)}>
                {t("admin.actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleStatus(p)}>
                {t(p.status === "ACTIVE" ? "catalog.products.deactivate" : "catalog.products.activate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem product="destructive" onClick={() => setDeleting(p)}>
                {t("catalog.products.deleteAction")}
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
        rowId={(p) => String(p.id)}
        loading={params.pending}
        empty={hasFilters ? t("catalog.products.emptyFiltered") : t("catalog.products.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("catalog.products.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "status"])}
            filters={
              <Select
                value={status || "all"}
                onValueChange={(v) => params.setFilter("status", v === "all" ? "" : String(v))}
              >
                <SelectTrigger className="w-36" aria-label={t("catalog.products.colStatus")}>
                  {/* Base UI renders the raw VALUE unless given children, so the
                      trigger would read "all" instead of "All statuses". */}
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
                <Button onClick={() => setCreating(true)}>{t("catalog.products.new")}</Button>
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

      {creating && <ProductDialog open onOpenChange={(o) => !o && setCreating(false)} />}
      {editing && (
        <ProductDialog variant={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {deleting && (
        <DeleteProductDialog
          variant={deleting}
          open
          onOpenChange={(o) => !o && setDeleting(null)}
        />
      )}
    </>
  );
}
