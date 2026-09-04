"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ProductCell } from "@/components/ds";
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
import { StatTiles } from "./stat-tiles";

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
      cell: (r) => <ProductCell size="sm" name={r.name} code={r.sku} />,
    },
    {
      id: "kind",
      header: t("inventory.stock.col.kind"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">
          {r.itemType === "MATERIAL" && r.kind
            ? // REPAIR, not a migration change. This key was
              // `inventory.materials.types.*` and the committed-upstream
              // material <-> supplier find-and-replace (MIGRATION-STATUS §3)
              // renamed the READ but not the locale files, which still have
              // `materials`. The page printed the raw key —
              // "inventory.suppliers.types.SEMI_FINISHED" — in the Type column.
              // The locale settles it: inventory.materials.types holds exactly
              // this enum's five values. Only call site in the app.
              t(`inventory.materials.types.${r.kind}`)
            : (r.kind ?? "—")}
        </span>
      ),
    },
    {
      id: "onHand",
      header: t("inventory.stock.col.onHand"),
      className: "text-right font-mono tracking-(--ls-mono) tabular-nums",
      cell: (r) => r.onHand,
    },
    {
      id: "reserved",
      header: <WithTip label={t("inventory.stock.col.reserved")} tip={t("inventory.stock.tip.reserved")} />,
      className: "text-right font-mono tracking-(--ls-mono) tabular-nums",
      hideOnMobile: true,
      cell: (r) => r.reserved,
    },
    {
      id: "needed",
      header: <WithTip label={t("inventory.stock.col.shortage")} tip={t("inventory.stock.tip.shortage")} />,
      className: "text-right font-mono tracking-(--ls-mono) tabular-nums",
      cell: (r) => (
        <span className={cn(r.needed > 0 && "font-semibold text-(--status-critical-fg)")}>
          {r.needed}
        </span>
      ),
    },
    {
      id: "available",
      header: <WithTip label={t("inventory.stock.col.available")} tip={t("inventory.stock.tip.available")} />,
      className: "text-right font-mono tracking-(--ls-mono) tabular-nums",
      cell: (r) => <span className="font-semibold">{r.available}</span>,
    },
    {
      id: "warehouses",
      header: t("inventory.stock.col.warehouses"),
      hideOnMobile: true,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.warehouses.length === 0 ? (
            <span className="text-(length:--fs-body-sm) text-(--text-muted)">—</span>
          ) : (
            r.warehouses.map((w) => (
              <span
                key={w.id}
                className="inline-flex items-center rounded-(--radius-pill) bg-(--surface-inset) px-2.5 py-1 text-(length:--fs-meta) text-(--text-body)"
              >
                {w.name}:{" "}
                <span className="ml-1 font-mono tracking-(--ls-mono) tabular-nums">
                  {w.quantity}
                </span>
              </span>
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
          <Button variant="ghost" size="sm" onClick={() => setAdjusting(r)}>
            {t("inventory.stock.adjust")}
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <>
      <StatTiles
        tiles={[
          { label: t("inventory.stock.tiles.items"), value: total },
          { label: t("inventory.stock.tiles.onHand"), value: totals.quantity, tone: "success" },
          {
            label: t("inventory.stock.tiles.reserved"),
            value: totals.reserved,
            tone: "progress",
          },
          { label: t("inventory.stock.tiles.shortage"), value: totals.needed, tone: "critical" },
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
            // The page's action moves out of the hero, which owns no CTA.
            actions={
              <Can permission="inventory.adjust">
                <Button variant="outline" onClick={() => setImporting(true)}>
                  {t("inventory.stock.import")}
                </Button>
              </Can>
            }
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
