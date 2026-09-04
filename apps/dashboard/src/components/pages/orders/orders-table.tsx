"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Image as ImageIcon, Package, Pencil, RefreshCw, Ban } from "lucide-react";

import { FilterChip, ProductCell, StatusBadge } from "@/components/ds";
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
import { OrderTimeline } from "./order-timeline";
import { BuyLabelsButton } from "./buy-labels-button";
import { DownloadLabelsButton } from "./download-labels-button";
import { OrderDialog } from "./order-dialog";
import { VoidLabelDialog } from "./void-label-dialog";
import { AssignDialog } from "./assign-dialog";
import { ImportDialog } from "./import-dialog";
import { DeleteOrdersDialog } from "./delete-orders-dialog";
import { money } from "@/lib/money";

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
  shipmentId: number | null;
  labelVoided: boolean;
  tracking: string | null;
  trackingStatus: string | null;
  shipTo: string | null;
  note: string | null;
  internalNote: string | null;
  updatedAt: string;
  productVariantId: number | null;
  shippingName: string | null;
  shippingCompany: string | null;
  shippingEmail: string | null;
  shippingPhone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
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
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [voidingLabelFor, setVoidingLabelFor] = useState<OrderRow | null>(null);
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
                  className="size-8 rounded-(--radius-xs) bg-(--surface-content) object-cover"
                />
              }
            />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-xs) bg-(--surface-content)">
              <Package className="size-4 stroke-(--icon-muted)" />
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
              className="size-8 shrink-0 rounded-(--radius-xs) object-cover ring-2 ring-(--status-success-dot)"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-mono text-(length:--fs-meta) font-medium tracking-(--ls-mono) text-(--text-body)">
              {o.externalId ?? `#${o.id}`}
            </p>
            <p className="truncate text-(length:--fs-meta) text-(--text-muted)">
              {o.marketplace ?? t("orders.noMarketplace")}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "variant",
      header: t("orders.colProduct"),
      // The DS's product cell: name, SKU in mono, variant on the meta line.
      // No image — the artwork thumbnail is the ORDER column's, where it is a
      // trigger, and one product per cell means one thumbnail per row.
      cell: (o) => (
        <ProductCell
          size="sm"
          name={o.productName ?? "—"}
          code={o.sku}
          meta={o.variantName}
        />
      ),
    },
    {
      id: "warehouse",
      header: t("orders.colCustomer"),
      hideOnMobile: true,
      // Only meaningful to someone who can see across accounts; a seller's own
      // orders are all theirs.
      cell: (o) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">
          {o.customerName ?? "—"}
        </span>
      ),
    },
    {
      id: "qty",
      header: t("orders.colQty"),
      className: "text-right tabular-nums",
      cell: (o) => (
        <span className="font-mono text-(length:--fs-body-sm) tracking-(--ls-mono)">
          {o.filled > 0 ? `${o.filled}/${o.quantity}` : o.quantity}
        </span>
      ),
    },
    {
      id: "status",
      header: t("orders.colStatus"),
      // The colour comes from STATUS_TONES via the raw status, so this badge
      // and the summary strip above can never disagree about a status. The
      // label stays the translated string.
      cell: (o) => (
        <StatusBadge status={o.status}>{t(`orders.statuses.${o.status}`)}</StatusBadge>
      ),
    },
    {
      id: "tracking",
      header: t("orders.colTracking"),
      hideOnMobile: true,
      cell: (o) =>
        o.tracking ? (
          <div className="min-w-0">
            <p className="truncate font-mono text-(length:--fs-meta) tracking-(--ls-mono) text-(--text-body)">
              {o.tracking}
            </p>
            {o.trackingStatus && (
              <p className="truncate text-(length:--fs-meta) text-(--text-muted)">
                {o.trackingStatus}
              </p>
            )}
          </div>
        ) : (
          <span className="text-(length:--fs-body-sm) text-(--text-muted)">—</span>
        ),
    },
    {
      id: "customer",
      header: t("orders.colWarehouse"),
      hideOnMobile: true,
      cell: (o) => (
        <span className="font-mono text-(length:--fs-meta) tracking-(--ls-mono) text-(--text-muted)">
          {o.warehouseCode ?? "—"}
        </span>
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
              <span className="font-mono text-(length:--fs-body-sm) tracking-(--ls-mono)">
                {money(o.baseCost)}
              </span>
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
                {/* Always available — the service itself decides what a
                    non-PENDING order still allows (quantity locks after
                    PENDING, most fields lock after CANCELLED) and reports
                    that back as a field/form error rather than the button
                    guessing and hiding fields that would have been fine. */}
                <Can permission="orders.update">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("orders.edit")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(o);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </Can>
                {/* Only when there is a live label to cancel — a voided one
                    already shows nothing here, and this button is not how
                    a NEW label gets bought (Buy labels handles that). */}
                {o.shipmentId && !o.labelVoided && o.tracking && (
                  <Can permission="orders.labels.manage">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("orders.labels.voidTitle")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setVoidingLabelFor(o);
                      }}
                    >
                      <Ban className="size-4" />
                    </Button>
                  </Can>
                )}
                {/* Artwork is only editable while the order is PENDING — the
                    service refuses later, so the button follows it. */}
                {o.status === "PENDING" && (
                  <Can permission="orders.update">
                    <Button
                      variant="ghost"
                      size="icon-sm"
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
                      size="icon-sm"
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
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">
          {new Date(o.placedAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <>
      {/* Chips, not tabs: these FILTER the same query rather than navigating,
          so they carry aria-pressed. `x === "all" ? "" : x` is the URL
          contract — "all" is the absence of the param, not a value. */}
      <div className="flex gap-2">
        {TABS.map((x) => (
          <FilterChip
            key={x}
            label={t(`orders.tabs.${x}`)}
            active={tab === x}
            onClick={() => params.setFilter("tab", x === "all" ? "" : x)}
          />
        ))}
      </div>

      <StatusSummary rows={summary} />

      <DataTable
        rows={rows}
        columns={columns}
        rowId={(o) => String(o.id)}
        mobileCard={(o) => <OrderMobileCard order={o} />}
        // Every order has a line to show, so the expander is on every row. The
        // panel fetches its own dates when it opens; nothing is loaded for the
        // twenty-four rows nobody expanded.
        renderExpanded={(o) => <OrderTimeline orderId={o.id} />}
        expandLabel={t("orders.timeline.toggle")}
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
      {editing && (
        <OrderDialog
          order={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      {voidingLabelFor?.shipmentId && (
        <VoidLabelDialog
          shipmentId={voidingLabelFor.shipmentId}
          trackingNumber={voidingLabelFor.tracking}
          open
          onOpenChange={(o) => !o && setVoidingLabelFor(null)}
        />
      )}
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
