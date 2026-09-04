"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTableToolbar,
  useTableParams,
  type Column,
} from "@/components/global/data-table";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { StatTiles } from "@/components/pages/inventory/stat-tiles";

import { BomsHeader } from "./boms-header";
import type { SiteOption } from "./boms-table";
import { StatusBadge } from "@/components/ds";

export type CoverageRowView = {
  key: string;
  materialId: number | null;
  sku: string;
  name: string;
  type: string | null;
  uom: string | null;
  quantity: number;
  reserved: number;
  needed: number;
  available: number;
  bomCount: number;
  perUnit: number;
  warehouses: { id: number; name: string; quantity: number }[];
  coverage: "NEEDED" | "NO_STOCK" | "UNMAPPED" | "AVAILABLE";
};

/**
 * Coverage is COMPUTED here, not a backend enum, so it is not in STATUS_TONES
 * and must not be routed through toneFor(). Explicit tones, chosen to say the
 * same things the old variants said: covered reads done, a shortage reads
 * critical, and the two "we cannot tell" states stay neutral rather than
 * borrowing an alarm colour for missing data.
 */
const COVERAGE_TONES = {
  AVAILABLE: "success",
  NEEDED: "critical",
  NO_STOCK: "neutral",
  UNMAPPED: "neutral",
} as const;

/**
 * Every component any live BOM names, and how covered it is.
 *
 * Ranked shortage → no stock → unassigned → available, SERVER-side. The point
 * of the screen is "what do I have to buy", and a fully-stocked component is
 * the least interesting column on it.
 */
export function CoverageTable({
  rows,
  tiles,
  sites,
}: {
  rows: CoverageRowView[];
  tiles: { components: number; linked: number; shortage: number; noStock: number };
  sites: SiteOption[];
}) {
  const params = useTableParams();
  const { t } = useTranslation();
  const hasFilters = Boolean(params.get("q") || params.get("customer"));

  const columns: Column<CoverageRowView>[] = [
    {
      id: "material",
      header: t("inventory.boms.coverage.col.material"),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">
            {r.sku}
            {r.uom ? ` · ${r.uom}` : ""}
          </p>
        </div>
      ),
    },
    {
      id: "coverage",
      header: t("inventory.boms.coverage.col.coverage"),
      cell: (r) => (
        <StatusBadge status={r.coverage} tone={COVERAGE_TONES[r.coverage]}>
          {t(`inventory.boms.coverage.badge.${r.coverage}`)}
        </StatusBadge>
      ),
    },
    {
      id: "quantity",
      header: t("inventory.boms.coverage.col.qty"),
      className: "text-right tabular-nums",
      cell: (r) => r.quantity,
    },
    {
      id: "reserved",
      header: t("inventory.boms.coverage.col.reserved"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      cell: (r) => r.reserved,
    },
    {
      id: "shortage",
      header: t("inventory.boms.coverage.col.shortage"),
      className: "text-right tabular-nums",
      cell: (r) => (
        <span className={cn(r.needed > 0 && "text-red-600 font-medium")}>{r.needed}</span>
      ),
    },
    {
      id: "available",
      header: t("inventory.boms.coverage.col.available"),
      className: "text-right tabular-nums",
      cell: (r) => <span className="font-medium">{r.available}</span>,
    },
    {
      id: "usedIn",
      header: t("inventory.boms.coverage.col.usedIn"),
      hideOnMobile: true,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-sm">
            {r.bomCount} {t("inventory.boms.coverage.boms")}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {r.perUnit} {t("inventory.boms.coverage.perUnit")}
          </span>
        </div>
      ),
    },
    {
      id: "warehouses",
      header: t("inventory.boms.coverage.col.warehouses"),
      hideOnMobile: true,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.warehouses.length === 0 ? (
            <span className="text-muted-foreground text-sm">—</span>
          ) : (
            <>
              {/* Four chips then a count: a material stocked at a dozen sites
                  would otherwise push every other row off the column. */}
              {r.warehouses.slice(0, 4).map((w) => (
                <Badge key={w.id} variant="secondary" className="font-normal">
                  {w.name}: {w.quantity}
                </Badge>
              ))}
              {r.warehouses.length > 4 && (
                <Badge variant="secondary">+{r.warehouses.length - 4}</Badge>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <BomsHeader />

      <StatTiles
        tiles={[
          { label: t("inventory.boms.coverage.tiles.components"), value: tiles.components },
          { label: t("inventory.boms.coverage.tiles.linked"), value: tiles.linked },
          {
            label: t("inventory.boms.coverage.tiles.shortage"),
            value: tiles.shortage,
            tone: "critical",
          },
          {
            label: t("inventory.boms.coverage.tiles.noStock"),
            value: tiles.noStock,
            tone: "attention",
          },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => r.key}
        loading={params.pending}
        empty={t("inventory.boms.coverage.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("inventory.boms.coverage.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "customer"])}
            filters={
              <Select
                value={params.get("customer") || "ALL"}
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
            }
          />
        }
      />
    </>
  );
}
