"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Image as ImageIcon, Package, RefreshCw } from "lucide-react";

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
  DataTablePagination,
  DataTableToolbar,
  useTableParams,
  type Column,
} from "@/components/global/data-table";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/global/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";
import { useTranslation } from "@/lib/i18n";
import { recalcOrdersAction } from "@/modules/fulfillment/orders/actions";

import { OrderStatusActions } from "./order-status-actions";
import { OrderQr, orderQrProps } from "./order-qr";
import { OrderMobileCard } from "./order-mobile-card";
import { OrderProofAction } from "./order-proof-action";
import { RefundDialog } from "./refund-dialog";
import { ArtworkDialog } from "./artwork-dialog";
import { ExportButton } from "./export-button";
import { StatusSummary, type StatusSummaryRow } from "./status-summary";
import { BuyLabelsButton } from "./buy-labels-button";
import { DownloadLabelsButton } from "./download-labels-button";
import { OrderDialog } from "./order-dialog";
import { AssignDialog } from "./assign-dialog";
import { ImportDialog } from "./import-dialog";
import { DeleteOrdersDialog } from "./delete-orders-dialog";

export type OrderRow = {
  id: number;
  externalId: string | null;
  marketplace: string | null;
  status: string;
  quantity: number;
  filled: number;
  paid: boolean;
  baseCost: string | null;
  placedAt: string;
  deadline: string | null;
  customerName: string | null;
  warehouseCode: string | null;
  productName: string | null;
  variantName: string | null;
  sku: string | null;
  mockupThumbnail: string | null;
  imageUrl: string | null;
  proofImageUrl: string | null;
  tracking: string | null;
  trackingStatus: string | null;
  shipTo: string | null;
  note: string | null;
};

const TABS = ["all", "processing", "attention"] as const;

const STATUSES = [
  "PENDING",
  "ASSIGNED",
  "IN_PRODUCTION",
  "FULFILLED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "ON_HOLD",
] as const;

/** Terminal states read as done; ON_HOLD, CANCELLED and REFUNDED stand out. */
function statusVariant(status: string) {
  if (status === "DELIVERED") return "default" as const;
  if (status === "CANCELLED" || status === "REFUNDED" || status === "ON_HOLD")
    return "destructive" as const;
  return "secondary" as const;
}

export function OrdersTable({
  rows,
  total,
  summary,
  warehouses,
}: {
  rows: OrderRow[];
  total: number;
  /** The floor's status cards. Empty for anyone who does not work orders —
   * the page decides, so a seller never pays for the query. */
  summary: StatusSummaryRow[];
  warehouses: { id: number; code: string; name: string }[];
}) {
  const params = useTableParams();
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();
  const [refunding, setRefunding] = useState(false);
  const [artworkFor, setArtworkFor] = useState<OrderRow | null>(null);
  const [recalcPending, setRecalcPending] = useState(false);

  /** Shared by the column button and the bulk one — the difference is only which
   * ids go in. */
  const recalc = async (ids: number[]) => {
    setRecalcPending(true);
    const result = await recalcOrdersAction(ids);
    setRecalcPending(false);
    // "Already charged" is a refusal with a reason, not a failure: the money
    // moved, so a refund is the tool.
    if (result.ok === false) {
      toast.error(t(`orders.recalc.${result.error}`));
      return;
    }
    toast.success(
      t("orders.recalc.done")
        .replace("{updated}", String(result.updated))
        .replace("{skipped}", String(result.skipped)),
    );
    clearSelection();
    router.refresh();
  };
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedIds = [...selected].map(Number);
  const clearSelection = () => setSelected(new Set());

  const tab = params.get("tab") || "all";
  const status = params.get("status");
  const hasFilters = Boolean(params.get("q") || status);

  const columns: Column<OrderRow>[] = [
    {
      id: "order",
      header: t("orders.colOrder"),
      cell: (o) => (
        <div className="flex min-w-0 items-center gap-3">
          {/* The design a customer prints, and the way into a real look at it
              — 32px answers "is there artwork", never "is it the RIGHT
              artwork", so the thumbnail opens the panel on its image view. */}
          {o.mockupThumbnail || o.imageUrl ? (
            <OrderQr
              {...orderQrProps(o)}
              initialFormat="image"
              trigger={
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.mockupThumbnail ?? o.imageUrl ?? ""}
                  alt=""
                  className="border-border size-8 rounded-md border object-cover"
                />
              }
            />
          ) : (
            <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
              <Package className="size-4" />
            </span>
          )}
          {/* The packed-parcel photo, when there is one. Beside the design
              rather than instead of it: a packer comparing the two is the
              whole reason both exist. */}
          {o.proofImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={o.proofImageUrl}
              alt=""
              title={t("orders.proof.thumb")}
              className="ring-vercel-green/60 size-8 shrink-0 rounded-md object-cover ring-2"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-medium">{o.externalId ?? `#${o.id}`}</p>
            <p className="text-muted-foreground truncate text-xs">
              {o.marketplace ?? t("orders.noMarketplace")}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "variant",
      header: t("orders.colProduct"),
      cell: (o) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{o.productName ?? "—"}</p>
          <p className="text-muted-foreground truncate text-xs">
            {[o.variantName, o.sku].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      id: "warehouse",
      header: t("orders.colCustomer"),
      hideOnMobile: true,
      // Only meaningful to someone who can see across accounts; a seller's own
      // orders are all theirs.
      cell: (o) => <span className="text-muted-foreground text-sm">{o.customerName ?? "—"}</span>,
    },
    {
      id: "qty",
      header: t("orders.colQty"),
      className: "text-right tabular-nums",
      cell: (o) => (
        <span className="text-sm">
          {o.filled > 0 ? `${o.filled}/${o.quantity}` : o.quantity}
        </span>
      ),
    },
    {
      id: "status",
      header: t("orders.colStatus"),
      cell: (o) => (
        <Badge variant={statusVariant(o.status)}>{t(`orders.statuses.${o.status}`)}</Badge>
      ),
    },
    {
      id: "tracking",
      header: t("orders.colTracking"),
      hideOnMobile: true,
      cell: (o) =>
        o.tracking ? (
          <div className="min-w-0">
            <p className="truncate font-mono text-xs">{o.tracking}</p>
            {o.trackingStatus && (
              <p className="text-muted-foreground truncate text-xs">{o.trackingStatus}</p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      id: "customer",
      header: t("orders.colWarehouse"),
      hideOnMobile: true,
      cell: (o) => (
        <span className="text-muted-foreground font-mono text-xs">{o.warehouseCode ?? "—"}</span>
      ),
    },
    // Money is gated: a customer packer has no business seeing what a seller
    // was charged. Dropped from the row list entirely rather than rendered
    // blank, so the table has no empty row hinting at hidden data.
    ...(can("orders.assign")
      ? [
          {
            id: "cost",
            header: t("orders.colCost"),
            className: "text-right tabular-nums",
            hideOnMobile: true,
            cell: (o: OrderRow) => (
              <span className="text-sm">{o.baseCost ? `$${o.baseCost}` : "—"}</span>
            ),
          } satisfies Column<OrderRow>,
        ]
      : []),
    // The floor's row. Only for people who actually work orders — a seller
    // has no scanner and no printer in this loop, so the row would be a
    // decoration that costs them horizontal space.
    ...(can("orders.status.update")
      ? [
          {
            id: "qr",
            header: t("orders.qr.column"),
            hideOnMobile: true,
            cell: (o: OrderRow) => (
              <div className="flex items-center gap-1">
                <OrderQr {...orderQrProps(o)} />
                <OrderProofAction orderId={o.id} hasProof={Boolean(o.proofImageUrl)} />
                {/* Artwork is only editable while the order is PENDING — the
                    service refuses later, so the button follows it. */}
                {o.status === "PENDING" && (
                  <Can permission="orders.update">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("orders.artwork.title")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setArtworkFor(o);
                      }}
                    >
                      <ImageIcon className="size-4" />
                    </Button>
                    {/* One column, one re-price. The bulk button does the same
                        call — this is for the single order somebody is
                        looking at, which is how it is used in practice. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("orders.recalc.action")}
                      disabled={recalcPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        void recalc([o.id]);
                      }}
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  </Can>
                )}
              </div>
            ),
          } satisfies Column<OrderRow>,
        ]
      : []),
    {
      id: "placedAt",
      header: t("orders.colPlaced"),
      hideOnMobile: true,
      cell: (o) => (
        <span className="text-muted-foreground text-sm">
          {new Date(o.placedAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex gap-1">
        {TABS.map((x) => (
          <button
            key={x}
            onClick={() => params.setFilter("tab", x === "all" ? "" : x)}
            aria-current={tab === x ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === x
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`orders.tabs.${x}`)}
          </button>
        ))}
      </div>

      <StatusSummary rows={summary} />

      <DataTable
        rows={rows}
        columns={columns}
        rowId={(o) => String(o.id)}
        mobileCard={(o) => <OrderMobileCard order={o} />}
        loading={params.pending}
        selected={selected}
        onSelectedChange={setSelected}
        empty={hasFilters ? t("orders.emptyFiltered") : t("orders.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("orders.search")}
            hasFilters={hasFilters}
            onClearFilters={() => params.clearFilters(["q", "status"])}
            selectedCount={selected.size}
            filters={
              <Select
                value={status || "all"}
                onValueChange={(v) => params.setFilter("status", v === "all" ? "" : String(v))}
              >
                <SelectTrigger className="w-44" aria-label={t("orders.colStatus")}>
                  <SelectValue>
                    {status ? t(`orders.statuses.${status}`) : t("orders.allStatuses")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("orders.allStatuses")}</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`orders.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            actions={
              <div className="flex flex-wrap gap-2">
                <OrderStatusActions
                  selected={selectedIds}
                  rows={rows}
                  onDone={clearSelection}
                />
                {selectedIds.length > 0 && (
                  <>
                    <Can permission="orders.status.update">
                      {/* A real route, opened in a new tab: the sheet prints
                          itself, and the operator keeps their place in the
                          table behind it. */}
                      <Button
                        variant="outline"
                        onClick={() =>
                          window.open(`/orders/print?ids=${selectedIds.join(",")}`, "_blank", "noopener")
                        }
                      >
                        {t("orders.qr.print")} ({selectedIds.length})
                      </Button>
                    </Can>
                    <Can permission="orders.labels.manage">
                      <BuyLabelsButton orderIds={selectedIds} onDone={clearSelection} />
                    </Can>
                    <Can permission="orders.assign">
                      <Button variant="outline" onClick={() => setAssigning(true)}>
                        {t("orders.assign")} ({selectedIds.length})
                      </Button>
                    </Can>
                    <Can permission="orders.update">
                      <Button
                        variant="outline"
                        disabled={recalcPending}
                        onClick={() => void recalc(selectedIds)}
                      >
                        {t("orders.recalc.action")}
                      </Button>
                    </Can>
                    <Can permission="orders.refund">
                      <Button variant="outline" onClick={() => setRefunding(true)}>
                        {t("orders.refund")}
                      </Button>
                    </Can>
                    <Can permission="orders.delete">
                      <Button variant="outline" onClick={() => setDeleting(true)}>
                        {t("orders.delete")}
                      </Button>
                    </Can>
                  </>
                )}
                <Can permission="orders.labels.manage">
                  <DownloadLabelsButton orderIds={selectedIds} />
                </Can>
                <ExportButton orderIds={selectedIds} />
                <Can permission="orders.create">
                  <Button variant="outline" onClick={() => setImporting(true)}>
                    {t("orders.import")}
                  </Button>
                  <Button onClick={() => setCreating(true)}>{t("orders.new")}</Button>
                </Can>
              </div>
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
            selectedCount={selected.size}
          />
        }
      />

      {creating && <OrderDialog open onOpenChange={(o) => !o && setCreating(false)} />}
      {importing && <ImportDialog open onOpenChange={(o) => !o && setImporting(false)} />}
      {assigning && (
        <AssignDialog
          orderIds={selectedIds}
          warehouses={warehouses}
          open
          onOpenChange={(o) => !o && setAssigning(false)}
          onDone={clearSelection}
        />
      )}
      {artworkFor && (
        <ArtworkDialog
          orderId={artworkFor.id}
          label={artworkFor.externalId ?? `#${artworkFor.id}`}
          designUrl={artworkFor.imageUrl}
          open
          onOpenChange={(o) => !o && setArtworkFor(null)}
        />
      )}
      {refunding && (
        <RefundDialog
          orderIds={selectedIds}
          open
          onOpenChange={(o) => !o && setRefunding(false)}
          onDone={clearSelection}
        />
      )}
      {deleting && (
        <DeleteOrdersDialog
          orderIds={selectedIds}
          open
          onOpenChange={(o) => !o && setDeleting(false)}
          onDone={clearSelection}
        />
      )}
    </>
  );
}
