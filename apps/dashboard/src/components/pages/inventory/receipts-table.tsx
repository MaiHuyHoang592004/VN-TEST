"use client";

import { useState } from "react";

import { StatusBadge } from "@/components/ds";
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

import { ReceiptDetailDialog } from "./receipt-detail-dialog";
import { ReceiptFormDialog } from "./receipt-form-dialog";
import { StatTiles } from "./stat-tiles";

export type SiteOption = { id: number; name: string; code: string };
export type MaterialOption = { id: number; sku: string; name: string; uom: string };

export type ReceiptRowView = {
  id: number;
  code: string;
  itemType: string;
  status: string;
  supplier: string | null;
  warehouse: string;
  shipmentCount: number;
  createdAt: string;
};

const STATUSES = ["PENDING", "PARTIAL", "COMPLETE", "REJECTED"] as const;

export function ReceiptsTable({
  rows,
  total,
  tiles,
  sites,
  suppliers,
}: {
  rows: ReceiptRowView[];
  total: number;
  /** Server-computed from shipmentsReport, never summed from `rows`. */
  tiles: { upcoming: number; overdue: number; partial: number; variance: number };
  sites: SiteOption[];
  suppliers: MaterialOption[];
}) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  const hasFilters = Boolean(params.get("q") || params.get("status") || params.get("customer"));

  const columns: Column<ReceiptRowView>[] = [
    {
      id: "code",
      header: t("inventory.receipts.col.code"),
      cell: (r) => (
        <span className="font-mono text-(length:--fs-meta) font-medium tracking-(--ls-mono) text-(--text-body)">
          {r.code}
        </span>
      ),
    },
    {
      id: "warehouse",
      header: t("inventory.receipts.col.warehouse"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">{r.warehouse}</span>
      ),
    },
    {
      id: "status",
      header: t("inventory.receipts.col.status"),
      // ReceiptStatus IS in STATUS_TONES (COMPLETE -> success, REJECTED ->
      // critical), so the local ternary goes and the colour derives from the
      // value like every other status in the app.
      cell: (r) => (
        <StatusBadge status={r.status}>
          {t(`inventory.receipts.status.${r.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: "supplier",
      header: t("inventory.receipts.col.supplier"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">{r.supplier ?? "—"}</span>
      ),
    },
    {
      id: "shipments",
      header: t("inventory.receipts.col.shipments"),
      className: "text-right font-mono tracking-(--ls-mono) tabular-nums",
      cell: (r) => r.shipmentCount,
    },
    {
      id: "createdAt",
      header: t("inventory.receipts.col.created"),
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-(length:--fs-body-sm) whitespace-nowrap text-(--text-muted)">
          {new Date(r.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <>
      <StatTiles
        tiles={[
          {
            label: t("inventory.receipts.tiles.upcoming"),
            value: tiles.upcoming,
            tone: "pending",
          },
          { label: t("inventory.receipts.tiles.overdue"), value: tiles.overdue, tone: "critical" },
          { label: t("inventory.receipts.tiles.partial"), value: tiles.partial, tone: "attention" },
          { label: t("inventory.receipts.tiles.variance"), value: tiles.variance, tone: "critical" },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={params.pending}
        onRowClick={(r) => setViewing(r.id)}
        empty={hasFilters ? t("inventory.receipts.emptyFiltered") : t("inventory.receipts.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("inventory.receipts.search")}
            // The page's action moves out of the hero, which owns no CTA.
            actions={
              <Can permission="inventory.receipts.create">
                <Button onClick={() => setCreating(true)}>{t("inventory.receipts.new")}</Button>
              </Can>
            }
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "status", "customer"])}
            filters={
              <>
                <Select
                  value={params.get("status") || "ALL"}
                  onValueChange={(v) => params.setFilter("status", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("inventory.receipts.allStatuses")}</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`inventory.receipts.status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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

      {creating && (
        <ReceiptFormDialog
          sites={sites}
          suppliers={suppliers}
          open
          onOpenChange={(o) => !o && setCreating(false)}
        />
      )}
      {viewing !== null && (
        <ReceiptDetailDialog
          receiptId={viewing}
          open
          onOpenChange={(o) => !o && setViewing(null)}
        />
      )}
    </>
  );
}
