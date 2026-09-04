"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Image as ImageIcon, Package, Pencil, RefreshCw, Ban, StickyNote, FolderOpen } from "lucide-react";

import { ProductCell, StatusBadge } from "@/components/ds";
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
/**
 * True when the url is a Drive FOLDER — a container, never an image.
 *
 * Deliberately a local one-liner rather than the richer `parseDriveUrl` in
 * @gwprint/shared: all this column needs to know is "can this go in an <img>",
 * and answering it here keeps the orders table independent of the Drive
 * resolver work landing separately. Swap to parseDriveUrl once that ships.
 */
const driveFolder = (url: string | null) =>
  Boolean(url && url.includes("/drive/folders/"));
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
  /** The MOCKUP, already an image endpoint — the row's one renderable
   *  picture. The design is `imageUrl`, and that one is a folder. */
  mockupThumbnail: string | null;
  imageUrl: string | null;
  proofImageUrl: string | null;
  shipmentId: number | null;
  labelVoided: boolean;
  tracking: string | null;
  trackingStatus: string | null;
  /** Carrier name and its service level, e.g. "USPS" · "Ground Advantage". */
  carrier: string | null;
  service: string | null;
  /** The purchased label, shown as the row's third thumbnail. */
  labelUrl: string | null;
  /** What the carrier charged. Null until a label is bought. */
  shipCost: string | null;
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


/**
 * One 32px image in the order row's strip, corner-tagged so the three are
 * telling apart at a glance: D design · M mockup · L shipping label.
 *
 * The tag is a one-letter chip, not a colour: three thumbnails distinguished
 * only by hue would be unreadable to anyone who does not see the hues, and
 * would need a legend nobody reads. The full word is the accessible name.
 *
 * Cream well, never grey — the DS's rule for anything holding a product image.
 *
 * A load failure is handled here rather than left to the browser: every source
 * is third-party (a Drive file whose sharing can change, a carrier's label
 * host), and a broken-image glyph in a dense table reads as "the app is
 * broken". An empty well reads as "no picture", which is the truth, and keeps
 * its tag so the row still says which slot came up empty.
 */
function Thumb({ src, tag, label }: { src: string; tag: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative block shrink-0">
      {failed ? (
        <span className="flex size-8 items-center justify-center rounded-(--radius-xs) bg-(--cream-200)">
          <ImageIcon className="size-4 stroke-(--icon-muted)" aria-hidden />
          <span className="sr-only">{label}</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          onError={() => setFailed(true)}
          className="size-8 rounded-(--radius-xs) bg-(--cream-200) object-cover"
        />
      )}
      <span
        aria-hidden
        className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-(--radius-pill) bg-(--navy-700) font-mono text-[0.5625rem] leading-none font-bold text-(--gwp-white)"
      >
        {tag}
      </span>
    </span>
  );
}

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

  /**
   * MEMOISED, and not for speed. AssignDialog, RefundDialog and BuyLabelsButton
   * each take this array as an effect dependency and re-run a server-side
   * PREVIEW when it changes. Rebuilt inline it was a new array identity on every
   * render of this component, so any unrelated re-render while one of those
   * dialogs was open fired the preview action again.
   */
  const selectedIds = useMemo(() => [...selected].map(Number), [selected]);
  const clearSelection = () => setSelected(new Set());

  const status = params.get("status");
  const hasFilters = Boolean(params.get("q") || status);

  const columns: Column<OrderRow>[] = [
    {
      id: "order",
      header: t("orders.colOrder"),
      cell: (o) => (
        <div className="flex min-w-0 items-start gap-3">
          {/* THREE thumbnails, corner-tagged D · M · L — design, mockup and
              the purchased shipping label. 32px answers "is there artwork",
              never "is it the RIGHT artwork", so D and M open the panel on its
              image view and L opens the label itself.

              Each slot is drawn only when its image exists. A row with no
              artwork keeps ONE empty cream well as the column's anchor, so the
              text beside it starts at the same x on every row; a row missing
              only its label simply has two. Nothing renders a grey box
              standing in for a picture that was never taken. */}
          <div className="flex shrink-0 items-center gap-1">
            {/* D is the DESIGN, and in this database the design is a Google
                Drive FOLDER, not a picture — 489 of 489 rows. A folder url in
                an <img> asks Drive for a login page and gets one, which is
                what used to draw a broken glyph on every row.

                So D is drawn as what it is: a folder you can open. The picture
                lives in M. Two wells, two different things, neither of them a
                guess. If imageUrl ever holds a real image it is rendered as
                one — the branch below stays for that day. */}
            {driveFolder(o.imageUrl) ? (
              <a
                href={o.imageUrl!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={t("orders.thumb.designFolder")}
                aria-label={t("orders.thumb.designFolder")}
                className="relative flex size-8 shrink-0 items-center justify-center rounded-(--radius-xs) bg-(--cream-200) transition-colors duration-(--dur-fast) hover:bg-(--cream-300) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
              >
                <FolderOpen className="size-4 stroke-(--icon-default)" aria-hidden />
                <span
                  aria-hidden
                  className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-(--radius-pill) bg-(--navy-700) font-mono text-[0.5625rem] leading-none font-bold text-(--gwp-white)"
                >
                  D
                </span>
              </a>
            ) : o.imageUrl ? (
              <OrderQr
                {...orderQrProps(o)}
                initialFormat="image"
                trigger={<Thumb src={o.imageUrl} tag="D" label={t("orders.thumb.design")} />}
              />
            ) : null}

            {/* M — the customer-facing mockup, and the row's one real picture.
                mockups.thumbnail is already a drive.google.com/thumbnail?id=
                url, i.e. an image endpoint, so it needs no resolving. */}
            {o.mockupThumbnail ? (
              <OrderQr
                {...orderQrProps(o)}
                initialFormat="image"
                trigger={<Thumb src={o.mockupThumbnail} tag="M" label={t("orders.thumb.mockup")} />}
              />
            ) : !o.imageUrl ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-xs) bg-(--cream-200)">
                <Package className="size-4 stroke-(--icon-muted)" aria-hidden />
              </span>
            ) : null}

            {o.labelUrl && (
              <a
                href={o.labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-(--radius-xs) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none"
              >
                <Thumb src={o.labelUrl} tag="L" label={t("orders.thumb.label")} />
              </a>
            )}

            {/* The packed-parcel photo. Beside the others rather than instead
                of them: a packer comparing design to parcel is why both exist.
                Its green ring is not the only signal — the alt text says what
                it is. */}
            {o.proofImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={o.proofImageUrl}
                alt={t("orders.proof.thumb")}
                className="size-8 shrink-0 rounded-(--radius-xs) object-cover ring-2 ring-(--status-success-dot)"
              />
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate font-mono text-(length:--fs-meta) font-medium tracking-(--ls-mono) text-(--text-body)">
              {o.externalId ?? `#${o.id}`}
            </p>
            <p className="truncate text-(length:--fs-meta) text-(--text-muted)">
              {o.marketplace ?? t("orders.noMarketplace")}
            </p>
            {/* Third line: the note. The customer's note reads as ordinary
                meta; the INTERNAL note is orange and ops-only, because the
                schema says in as many words that it is never shown to the
                customer. title= carries the full text for a note longer than
                the column. */}
            {o.note && (
              <p
                title={o.note}
                className="flex items-center gap-1 truncate text-(length:--fs-meta) text-(--text-muted)"
              >
                <StickyNote className="size-3 shrink-0 stroke-(--icon-muted)" aria-hidden />
                <span className="truncate">{o.note}</span>
              </p>
            )}
            {o.internalNote && can("orders.status.update") && (
              <p
                title={o.internalNote}
                className="flex items-center gap-1 truncate text-(length:--fs-meta) text-(--status-attention-fg)"
              >
                <StickyNote className="size-3 shrink-0 stroke-(--status-attention-dot)" aria-hidden />
                <span className="truncate">{o.internalNote}</span>
              </p>
            )}
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
            {/* Who is carrying it, and on what service. Rendered only when the
                shipment actually has them — an order with no label bought yet
                leaves this blank rather than guessing a carrier. */}
            {(o.carrier || o.service) && (
              <p className="truncate text-(length:--fs-meta) text-(--text-muted)">
                {[o.carrier, o.service].filter(Boolean).join(" · ")}
              </p>
            )}
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
    {
      id: "cost",
      header: t("orders.colCostShip"),
      className: "text-right tabular-nums",
      hideOnMobile: true,
      // NO LONGER gated on orders.assign. The seller's wallet is charged both
      // the base cost and the shipping, so hiding the two figures hid what the
      // seller was billed — from the person billed. Both are their own order's
      // fields, read through the same scope as the rest of the row, so this
      // exposes nothing that was not already theirs.
      cell: (o: OrderRow) => (
        <div className="whitespace-nowrap">
          <p className="font-mono text-(length:--fs-body-sm) tracking-(--ls-mono) text-(--text-body)">
            {money(o.baseCost)}
          </p>
          {/* A bought label costs what the carrier charged; before that it is
              an ESTIMATE and says so, because the two are not the same promise. */}
          {o.shipCost ? (
            <p className="font-mono text-(length:--fs-micro) tracking-(--ls-mono) text-(--text-muted)">
              + {money(o.shipCost)}
            </p>
          ) : null}
        </div>
      ),
    } satisfies Column<OrderRow>,
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
      <StatusSummary rows={summary} />

      {/* `params.pending` DIMS the table, it does not blank it. useTableParams
          runs the navigation in a transition precisely so the rows that are
          already on screen stay there; feeding `pending` to DataTable's
          `loading` threw them away and flashed a skeleton on every search
          keystroke, status change and page turn. aria-busy tells AT the same
          thing without removing the content it is reading. */}
      <div
        aria-busy={params.pending || undefined}
        className={
          params.pending
            ? "opacity-60 transition-opacity duration-(--dur-fast) motion-reduce:transition-none"
            : "transition-opacity duration-(--dur-fast) motion-reduce:transition-none"
        }
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowId={(o) => String(o.id)}
          mobileCard={(o) => (
            <OrderMobileCard
              order={o}
              // The phone gets the SAME row actions the desktop row does, behind
              // the same permission gates — the card is the row on a smaller
              // screen, not a reduced one.
              onEdit={() => setEditing(o)}
              onVoidLabel={() => setVoidingLabelFor(o)}
              onArtwork={() => setArtworkFor(o)}
              onRecalc={() => void recalc([o.id])}
              recalcPending={recalcPending}
            />
          )}
          // Every order has a line to show, so the expander is on every row. The
          // panel fetches its own dates when it opens; nothing is loaded for the
          // twenty-four rows nobody expanded.
          renderExpanded={(o) => <OrderTimeline orderId={o.id} />}
          expandLabel={t("orders.timeline.toggle")}
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
      </div>

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
          // The mockup's thumbnail IS its url for anything this dialog set —
          // setOrderArtwork writes the same string to both — and it is the
          // only mockup field the orders query selects.
          mockupUrl={artworkFor.mockupThumbnail}
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
