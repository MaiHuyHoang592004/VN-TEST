"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  DataTableToolbar,
  useTableParams,
  type Column,
} from "@/components/global/data-table";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

const MOVEMENT_TYPES = [
  "RECEIPT",
  "MANUAL_IMPORT",
  "MANUAL_ADJUSTMENT",
  "RESERVE",
  "RESERVE_RELEASE",
  "CONSUME",
  "RETURN",
  "NEEDED",
  "NEEDED_RESOLVED",
] as const;

export type MovementRowView = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  reference: string | null;
  createdAt: string;
  warehouse: string;
  user: string | null;
  sku: string | null;
  name: string | null;
};

export function MovementsTable({
  rows,
  nextCursor,
  sites,
}: {
  rows: MovementRowView[];
  /** Null when this is the last page. */
  nextCursor: string | null;
  sites: { id: number; name: string }[];
}) {
  const params = useTableParams();
  const { t } = useTranslation();

  const hasFilters = Boolean(
    params.get("q") || params.get("type") || params.get("customer") || params.get("itemType"),
  );

  const columns: Column<MovementRowView>[] = [
    {
      id: "createdAt",
      header: t("inventory.movements.col.created"),
      cell: (m) => (
        <span className="text-(length:--fs-body-sm) whitespace-nowrap text-(--text-muted)">
          {new Date(m.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: "type",
      header: t("inventory.movements.col.type"),
      // EXPLICIT neutral, never toneFor(). status-tones.ts is unambiguous:
      // InventoryMovementType.RETURN "is a movement TYPE that happens to
      // collide with the DS's `Return` status key. Do not pass it to
      // toneFor()." A movement type is not a status, and the direction — the
      // part that carries meaning — is coloured in the quantity column.
      cell: (m) => (
        <StatusBadge status={m.type} tone="neutral" dot={false}>
          {t(`inventory.movements.types.${m.type}`)}
        </StatusBadge>
      ),
    },
    {
      id: "item",
      header: t("inventory.movements.col.item"),
      cell: (m) => <ProductCell size="sm" name={m.name ?? "—"} code={m.sku} />,
    },
    {
      id: "warehouse",
      header: t("inventory.movements.col.warehouse"),
      hideOnMobile: true,
      cell: (m) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">{m.warehouse}</span>
      ),
    },
    {
      id: "quantity",
      header: t("inventory.movements.col.quantity"),
      className: "text-right tabular-nums",
      // The SIGN is the information: movements that take stock away are
      // negative, and the colour follows the sign rather than the type — so a
      // new movement type renders correctly without touching this. The DS asks
      // for direction as an ARROW in the tone's ink rather than a coloured
      // word, so the figure reads as a figure and the direction as a glyph.
      cell: (m) => (
        <span
          className={cn(
            "inline-flex items-center justify-end gap-1 font-mono font-semibold tracking-(--ls-mono)",
            m.quantity < 0 ? "text-(--status-critical-fg)" : "text-(--status-success-fg)",
          )}
        >
          {m.quantity < 0 ? (
            <ArrowDownRight aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
        </span>
      ),
    },
    {
      id: "reference",
      header: t("inventory.movements.col.reference"),
      hideOnMobile: true,
      cell: (m) => (
        <span className="font-mono text-(length:--fs-meta) tracking-(--ls-mono) text-(--text-muted)">
          {m.reference ?? "—"}
        </span>
      ),
    },
    {
      id: "user",
      header: t("inventory.movements.col.user"),
      hideOnMobile: true,
      cell: (m) => (
        <span className="text-(length:--fs-body-sm) text-(--text-muted)">{m.user ?? "—"}</span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowId={(m) => m.id}
        loading={params.pending}
        empty={
          hasFilters ? t("inventory.movements.emptyFiltered") : t("inventory.movements.empty")
        }
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("inventory.movements.search")}
            hasFilters={hasFilters}
            onClearFilters={() =>
              params.clearFilters(["q", "type", "customer", "itemType", "cursor"])
            }
            filters={
              <>
                <Select
                  value={params.get("itemType") || "ALL"}
                  onValueChange={(v) => params.setFilter("itemType", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("inventory.movements.allItems")}</SelectItem>
                    <SelectItem value="MATERIAL">
                      {t("inventory.stock.types.MATERIAL")}
                    </SelectItem>
                    <SelectItem value="PRODUCT">{t("inventory.stock.types.PRODUCT")}</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={params.get("type") || "ALL"}
                  onValueChange={(v) => params.setFilter("type", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("inventory.movements.allTypes")}</SelectItem>
                    {MOVEMENT_TYPES.map((mt) => (
                      <SelectItem key={mt} value={mt}>
                        {t(`inventory.movements.types.${mt}`)}
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
          nextCursor ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => params.setFilter("cursor", nextCursor)}>
                {t("inventory.movements.loadMore")}
              </Button>
            </div>
          ) : null
        }
      />
    </>
  );
}
