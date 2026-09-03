"use client";

import { useState } from "react";

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
import { useTranslation } from "@/lib/i18n";
import { StatTiles } from "@/components/pages/inventory/stat-tiles";

import { BomDialog } from "./bom-dialog";
import { BomsHeader } from "./boms-header";

export type MaterialOption = { id: number; sku: string; name: string; uom: string };
export type SkuOption = { id: number; sku: string | null; name: string };
export type SiteOption = { id: number; name: string; code: string };

export type BomRowView = {
  id: number;
  name: string;
  version: number;
  status: string;
  variantId: number;
  variantSku: string | null;
  variantName: string;
  summary: {
    lineCount: number;
    mappedLineCount: number;
    requiredLineCount: number;
    unmappedLineCount: number;
  };
};

export function BomsTable({
  rows,
  total,
  tiles,
  suppliers,
  skus,
  sites,
}: {
  rows: BomRowView[];
  total: number;
  /** Server-computed over the whole filter, never summed from `rows`. */
  tiles: { total: number; active: number; draft: number; unmappedLines: number };
  suppliers: MaterialOption[];
  skus: SkuOption[];
  sites: SiteOption[];
}) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [editing, setEditing] = useState<BomRowView | null>(null);
  const [creatingFor, setCreatingFor] = useState<SkuOption | null>(null);

  const hasFilters = Boolean(params.get("q") || params.get("status"));

  const columns: Column<BomRowView>[] = [
    {
      id: "product",
      header: t("inventory.boms.col.variant"),
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{b.variantName}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">{b.variantSku ?? "—"}</p>
        </div>
      ),
    },
    {
      id: "bom",
      header: t("inventory.boms.col.bom"),
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{b.name}</p>
          <p className="text-muted-foreground text-xs">v{b.version}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: t("inventory.boms.col.status"),
      cell: (b) => (
        <Badge variant={b.status === "ACTIVE" ? "default" : "secondary"}>
          {t(`inventory.boms.status.${b.status}`)}
        </Badge>
      ),
    },
    {
      id: "lines",
      header: t("inventory.boms.col.lines"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (b) => (
        <span className="text-muted-foreground text-sm">
          {b.summary.requiredLineCount} {t("inventory.boms.linesOf")} {b.summary.lineCount}
        </span>
      ),
    },
    {
      id: "components",
      header: t("inventory.boms.col.components"),
      hideOnMobile: true,
      cell: (b) => (
        <span className="text-sm">
          <span className="text-muted-foreground">
            {b.summary.mappedLineCount} {t("inventory.boms.linked")}
          </span>
          {b.summary.unmappedLineCount > 0 && (
            <span className="text-vercel-red ml-2 font-medium">
              {b.summary.unmappedLineCount} {t("inventory.boms.incomplete")}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "manage",
      header: <span className="sr-only">{t("inventory.boms.col.manage")}</span>,
      className: "w-20",
      cell: (b) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
          {t("inventory.boms.manage")}
        </Button>
      ),
    },
  ];

  return (
    <>
      <BomsHeader
        actions={
          <Can permission="boms.manage">
            <Select
              value=""
              onValueChange={(v) => {
                const sku = skus.find((s) => String(s.id) === v);
                if (sku) setCreatingFor(sku);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("inventory.boms.new")} />
              </SelectTrigger>
              <SelectContent>
                {skus.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} — {s.sku ?? `#${s.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Can>
        }
      />

      <StatTiles
        tiles={[
          { label: t("inventory.boms.tiles.total"), value: tiles.total },
          { label: t("inventory.boms.tiles.active"), value: tiles.active },
          { label: t("inventory.boms.tiles.draft"), value: tiles.draft },
          {
            label: t("inventory.boms.tiles.incomplete"),
            value: tiles.unmappedLines,
            tone: "danger",
          },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowId={(b) => String(b.id)}
        loading={params.pending}
        empty={hasFilters ? t("inventory.boms.emptyFiltered") : t("inventory.boms.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("inventory.boms.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "status"])}
            filters={
              <Select
                value={params.get("status") || "ALL"}
                onValueChange={(v) => params.setFilter("status", !v || v === "ALL" ? "" : v)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("admin.filters.allStatuses")}</SelectItem>
                  {["DRAFT", "ACTIVE", "INACTIVE"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`inventory.boms.status.${s}`)}
                    </SelectItem>
                  ))}
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

      {editing && (
        <BomDialog
          variantId={editing.variantId}
          variantLabel={editing.variantName}
          bomId={editing.id}
          suppliers={suppliers}
          sites={sites}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      {creatingFor && (
        <BomDialog
          variantId={creatingFor.id}
          variantLabel={creatingFor.name}
          suppliers={suppliers}
          sites={sites}
          open
          onOpenChange={(o) => !o && setCreatingFor(null)}
        />
      )}
    </>
  );
}
