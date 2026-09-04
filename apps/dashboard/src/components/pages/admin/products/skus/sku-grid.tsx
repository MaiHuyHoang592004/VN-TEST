"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DataTable,
  DataTableToolbar,
  type Column,
} from "@/components/global/data-table";
import { Can } from "@/components/global/permission-gate";
import { useTranslation } from "@/lib/i18n";
import {
  detachSkuAction,
  setPricesAction,
  updateSkuAction,
} from "@/modules/catalog/product-variants/actions";

import { AttachVariantsDialog } from "./attach-variants-dialog";
import { BulkPricesDialog } from "./bulk-prices-dialog";
import { StatusBadge } from "@/components/ds";

/** tier 0 is the base/public price; 1-4 match User.tier. */
export const TIERS = [0, 1, 2, 3, 4] as const;

export type SkuRow = {
  id: number;
  variantId: number;
  variantName: string;
  variantKey: string;
  sku: string | null;
  position: string | null;
  stock: number;
  status: string;
  /** Fixed-2 string. Never a number — see the page for why. */
  salePrice: string;
  /** tier → fixed-2 string. A missing tier means "no column", which is what
   * effectivePrice falls back from. */
  prices: Record<string, string>;
};

/**
 * The pricing grid. Edits are held locally and saved per column, rather than
 * firing a request per keystroke: a tier table is edited as a SET (change two
 * tiers, then save), and autosaving each field would write half-finished
 * tables and make the tier-0-required rule fire while someone is still typing.
 *
 * A column is only savable once it is dirty, so the button doubles as the
 * unsaved-changes indicator.
 */
export function SkuGrid({
  productId,
  rows,
  attachable,
}: {
  productId: number;
  rows: SkuRow[];
  attachable: { id: number; name: string; key: string }[];
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [attaching, setAttaching] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<number | null>(null);
  /** skuId → tier → value, only for rows the user has touched. */
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});

  const valueFor = (column: SkuRow, tier: number) =>
    edits[column.id]?.[tier] ?? column.prices[tier] ?? "";

  const isDirty = (column: SkuRow) =>
    TIERS.some((tier) => valueFor(column, tier) !== (column.prices[tier] ?? ""));

  const setPrice = (id: number, tier: number, value: string) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], [tier]: value } }));

  const savePrices = async (column: SkuRow) => {
    // Blank means "no price at this tier" — the column is DROPPED rather than
    // sent as 0.00, which would be a real price of nothing.
    const prices = TIERS.map((tier) => ({ tier, price: valueFor(column, tier) })).filter(
      (p) => p.price.trim() !== "",
    );
    if (!prices.some((p) => p.tier === 0)) {
      toast.error(t("catalog.skus.errBaseRequired"));
      return;
    }
    setSaving(column.id);
    const result = await setPricesAction(productId, column.id, prices);
    setSaving(null);
    if (result && "error" in result && result.error) {
      toast.error(t("catalog.skus.errSave"));
      return;
    }
    setEdits((e) => {
      const next = { ...e };
      delete next[column.id];
      return next;
    });
    toast.success(t("catalog.skus.pricesSaved"));
    router.refresh();
  };

  const saveField = async (column: SkuRow, patch: Partial<SkuRow>) => {
    const result = await updateSkuAction(productId, column.id, {
      sku: patch.sku ?? column.sku ?? "",
      position: patch.position ?? column.position ?? "",
      salePrice: patch.salePrice ?? column.salePrice,
      status: patch.status ?? column.status,
    });
    if (result && "error" in result && result.error === "sku-taken") {
      toast.error(t("catalog.skus.errSkuTaken"));
      return;
    }
    router.refresh();
  };

  const detach = async (column: SkuRow) => {
    const result = await detachSkuAction(productId, column.id);
    if (!result.ok) {
      toast.error(t("catalog.skus.errInUse"));
      return;
    }
    toast.success(t("catalog.skus.detached"));
    router.refresh();
  };

  const priceColumns: Column<SkuRow>[] = TIERS.map((tier) => ({
    id: `tier${tier}`,
    header: tier === 0 ? t("catalog.skus.colBase") : `T${tier}`,
    className: "w-24",
    cell: (column) => (
      <Input
        value={valueFor(column, tier)}
        onChange={(e) => setPrice(column.id, tier, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && isDirty(column)) savePrices(column);
        }}
        placeholder={tier === 0 ? "0.00" : "—"}
        inputMode="decimal"
        aria-label={`${column.variantName} ${tier === 0 ? t("catalog.skus.colBase") : `T${tier}`}`}
        className="h-8 w-20 text-right font-mono text-xs tabular-nums"
      />
    ),
  }));

  const columns: Column<SkuRow>[] = [
    {
      id: "product",
      header: t("catalog.skus.colVariant"),
      cell: (column) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{column.variantName}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">{column.variantKey}</p>
        </div>
      ),
    },
    {
      id: "sku",
      header: t("catalog.skus.colSku"),
      cell: (column) => (
        <Input
          defaultValue={column.sku ?? ""}
          // Saved on blur, not per keystroke: a unique constraint would reject
          // every prefix of the code as it is typed.
          onBlur={(e) => e.target.value !== (column.sku ?? "") && saveField(column, { sku: e.target.value })}
          placeholder="—"
          aria-label={`${column.variantName} ${t("catalog.skus.colSku")}`}
          className="h-8 w-28 font-mono text-xs"
        />
      ),
    },
    {
      id: "stock",
      header: t("catalog.skus.colStock"),
      className: "text-right tabular-nums",
      // Read-only: WarehouseInventory is the source of truth and this is a
      // cached total. Inventory lands in doc 05.
      cell: (column) => <span className="text-muted-foreground text-sm">{column.stock}</span>,
    },
    ...priceColumns,
    {
      id: "status",
      header: t("catalog.skus.colStatus"),
      cell: (column) => (
        <StatusBadge status={column.status}>
          {t(`catalog.statuses.${column.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: "save",
      header: <span className="sr-only">{t("catalog.skus.save")}</span>,
      className: "w-24",
      cell: (column) =>
        isDirty(column) ? (
          <Button size="sm" onClick={() => savePrices(column)} disabled={saving === column.id}>
            {t("catalog.skus.save")}
          </Button>
        ) : null,
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-10",
      cell: (column) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`${t("admin.actions.for")} ${column.variantName}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                saveField(column, { status: column.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
              }
            >
              {t(column.status === "ACTIVE" ? "catalog.products.deactivate" : "catalog.products.activate")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => detach(column)}>
              {t("catalog.skus.detach")}
            </DropdownMenuItem>
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
        rowId={(r) => String(r.id)}
        selected={selected}
        onSelectedChange={setSelected}
        empty={t("catalog.skus.empty")}
        toolbar={
          <DataTableToolbar
            actions={
              <Can permission="products.manage">
                <div className="flex gap-2">
                  {selected.size > 0 && (
                    <Button variant="outline" onClick={() => setBulk(true)}>
                      {t("catalog.skus.bulkPrices")} ({selected.size})
                    </Button>
                  )}
                  <Button onClick={() => setAttaching(true)} disabled={attachable.length === 0}>
                    {t("catalog.skus.attach")}
                  </Button>
                </div>
              </Can>
            }
          />
        }
      />

      {attaching && (
        <AttachVariantsDialog
          productId={productId}
          variants={attachable}
          open
          onOpenChange={(o) => !o && setAttaching(false)}
        />
      )}
      {bulk && (
        <BulkPricesDialog
          productId={productId}
          skuIds={[...selected].map(Number)}
          open
          onOpenChange={(o) => {
            if (!o) {
              setBulk(false);
              setSelected(new Set());
            }
          }}
        />
      )}
    </>
  );
}
