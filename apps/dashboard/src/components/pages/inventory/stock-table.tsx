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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  useTableParams,
  type Column,
} from "@/components/global/data-table";
import { Can } from "@/components/global/permission-gate";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

import { AdjustStockDialog } from "./adjust-stock-dialog";
import { ImportStockDialog } from "./import-stock-dialog";
import { InventoryHeader, StatTiles } from "./stat-tiles";

export type StockRowView = {
  itemType: "MATERIAL" | "PRODUCT";
  itemId: number;
  sku: string;
  name: string;
  kind: string | null;
  uom: string | null;
  onHand: number;
  reserved: number;
  needed: number;
  available: number;
  warehouses: { id: number; name: string; quantity: number }[];
};

export type SiteOption = { id: number; name: string; code: string };

export function StockTable({
  rows,
  total,
  totals,
  sites,
  itemType,
}: {
  rows: StockRowView[];
  total: number;
  /** Server-computed over the WHOLE filter — never summed from `rows`. */
  totals: { quantity: number; reserved: number; needed: number };
  sites: SiteOption[];
  itemType: "MATERIAL" | "PRODUCT";
}) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [adjusting, setAdjusting] = useState<StockRowView | null>(null);
  const [importing, setImporting] = useState(false);

  const customer = params.get("customer");
  const hasFilters = Boolean(params.get("q") || customer);

  const columns: Column<StockRowView>[] = [
    {
      id: "item",
      header: t("inventory.stock.col.item"),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">{r.sku}</p>
        </div>
      ),
    },
    {
      id: "kind",
      header: t("inventory.stock.col.kind"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-muted-foreground text-sm">
          {r.itemType === "MATERIAL" && r.kind
            ? t(`inventory.suppliers.types.${r.kind}`)
            : (r.kind ?? "—")}
        </span>
      ),
    },
    {
      id: "onHand",
      header: t("inventory.stock.col.onHand"),
      className: "text-right tabular-nums",
      cell: (r) => r.onHand,
    },
    {
      id: "reserved",
      header: <WithTip label={t("inventory.stock.col.reserved")} tip={t("inventory.stock.tip.reserved")} />,
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (r) => r.reserved,
    },
    {
      id: "needed",
      header: <WithTip label={t("inventory.stock.col.shortage")} tip={t("inventory.stock.tip.shortage")} />,
      className: "text-right tabular-nums",
      cell: (r) => (
        <span className={cn(r.needed > 0 && "text-vercel-red font-medium")}>{r.needed}</span>
      ),
    },
    {
      id: "available",
      header: <WithTip label={t("inventory.stock.col.available")} tip={t("inventory.stock.tip.available")} />,
      className: "text-right tabular-nums",
      cell: (r) => <span className="font-medium">{r.available}</span>,
    },
    {
      id: "warehouses",
      header: t("inventory.stock.col.warehouses"),
      hideOnMobile: true,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.warehouses.length === 0 ? (
            <span className="text-muted-foreground text-sm">—</span>
          ) : (
            r.warehouses.map((w) => (
              <Badge key={w.id} product="secondary" className="font-normal">
                {w.name}: {w.quantity}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-24",
      cell: (r) => (
        <Can permission="inventory.adjust">
          <Button product="ghost" size="sm" onClick={() => setAdjusting(r)}>
            {t("inventory.stock.adjust")}
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <>
      <InventoryHeader
        title={t("inventory.stock.title")}
        subtitle={t("inventory.stock.subtitle")}
        actions={
          <Can permission="inventory.adjust">
            <Button product="outline" onClick={() => setImporting(true)}>
              {t("inventory.stock.import")}
            </Button>
          </Can>
        }
      />

      <StatTiles
        tiles={[
          { label: t("inventory.stock.tiles.items"), value: total },
          { label: t("inventory.stock.tiles.onHand"), value: totals.quantity },
          { label: t("inventory.stock.tiles.reserved"), value: totals.reserved },
          { label: t("inventory.stock.tiles.shortage"), value: totals.needed, tone: "danger" },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => `${r.itemType}-${r.itemId}`}
        loading={params.pending}
        empty={hasFilters ? t("inventory.stock.emptyFiltered") : t("inventory.stock.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("inventory.stock.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "customer"])}
            filters={
              <>
                {/* One page replaces legacy's two parallel screens: the toggle
                    is a filter, not a different application. */}
                <Select
                  value={itemType}
                  onValueChange={(v) => v && params.setFilter("itemType", v)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MATERIAL">
                      {t("inventory.stock.types.MATERIAL")}
                    </SelectItem>
                    <SelectItem value="PRODUCT">
                      {t("inventory.stock.types.PRODUCT")}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={customer || "ALL"}
                  onValueChange={(v) => params.setFilter("customer", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("inventory.stock.allWarehouses")}</SelectItem>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
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

      {adjusting && (
        <AdjustStockDialog
          column={adjusting}
          sites={sites}
          open
          onOpenChange={(o) => !o && setAdjusting(null)}
        />
      )}
      {importing && (
        <ImportStockDialog sites={sites} open onOpenChange={(o) => !o && setImporting(false)} />
      )}
    </>
  );
}

/** A row header that explains its own number. The three counters here are
 * the ones people mix up, and the tooltips are the same sentences the floor
 * already had in the legacy UI. */
function WithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="decoration-muted-foreground/50 cursor-help underline decoration-dotted underline-offset-4" />}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
