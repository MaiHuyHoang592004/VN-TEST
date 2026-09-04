"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { StatTiles } from "@/components/pages/inventory/stat-tiles";
import { useTranslation } from "@/lib/i18n";
import { deleteCategoryAction, deleteEntryAction } from "@/modules/finance/expenses/actions";

import { CategoryDialog } from "./category-dialog";
import { EntryDialog } from "./entry-dialog";

export type CategoryRow = {
  id: number;
  name: string;
  type: string;
  note: string | null;
  updatedAt: string;
  entryCount: number;
};

export type VendorOption = { id: number; code: string; name: string };

export type EntryRow = {
  id: number;
  type: string;
  amount: string;
  occurredAt: string;
  paymentMethod: string | null;
  description: string | null;
  category: { id: number; name: string };
  vendor: { id: number; name: string } | null;
};

const money = (v: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v));

export function ExpensesPanel({
  tab,
  rows,
  total,
  summary,
  categories,
  vendors,
}: {
  tab: "entries" | "categories";
  rows: EntryRow[];
  total: number;
  /** Server-computed over the WHOLE filter (a groupBy), never a sum of `rows` —
   * the legacy page added up the page and lied past page one. */
  summary: { expense: string; income: string; net: string; count: number };
  categories: CategoryRow[];
  vendors: VendorOption[];
}) {
  const params = useTableParams();
  const { t } = useTranslation();

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("finance.expenses.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("finance.expenses.subtitle")}</p>
        </div>
        {/* The tab lives in the URL, so a deep link and the back button both
            work — the only thing the "tabs are routes" rule actually protects. */}
        <div className="border-border flex gap-1 rounded-md border p-1">
          {(["entries", "categories"] as const).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={tab === key ? "secondary" : "ghost"}
              onClick={() => params.setFilter("tab", key === "entries" ? "" : key)}
            >
              {t(`finance.expenses.tabs.${key}`)}
            </Button>
          ))}
        </div>
      </div>

      {tab === "entries" ? (
        <EntriesTab
          rows={rows}
          total={total}
          summary={summary}
          categories={categories}
          vendors={vendors}
        />
      ) : (
        <CategoriesTab categories={categories} />
      )}
    </>
  );
}

function EntriesTab({
  rows,
  total,
  summary,
  categories,
  vendors,
}: {
  rows: EntryRow[];
  total: number;
  summary: { expense: string; income: string; net: string; count: number };
  categories: CategoryRow[];
  vendors: VendorOption[];
}) {
  const params = useTableParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const [creating, setCreating] = useState(false);

  const type = params.get("type");
  const category = params.get("category");
  const vendor = params.get("vendor");
  const hasFilters = Boolean(
    params.get("q") || type || category || vendor || params.get("from") || params.get("to"),
  );

  const remove = async (entry: EntryRow) => {
    if (!window.confirm(t("finance.expenses.deleteConfirm"))) return;
    await deleteEntryAction(entry.id);
    router.refresh();
  };

  const columns: Column<EntryRow>[] = [
    {
      id: "occurredAt",
      header: t("finance.expenses.colDate"),
      cell: (e) => (
        <span className="text-sm whitespace-nowrap">
          {new Date(e.occurredAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "type",
      header: t("finance.expenses.colType"),
      cell: (e) => (
        <Badge variant={e.type === "INCOME" ? "default" : "secondary"}>
          {t(`finance.expenses.types.${e.type}`)}
        </Badge>
      ),
    },
    {
      id: "category",
      header: t("finance.expenses.colCategory"),
      cell: (e) => <span className="text-sm">{e.category.name}</span>,
    },
    {
      id: "vendor",
      header: t("finance.expenses.colVendor"),
      hideOnMobile: true,
      cell: (e) => <span className="text-muted-foreground text-sm">{e.vendor?.name ?? "—"}</span>,
    },
    {
      id: "amount",
      header: t("finance.expenses.colAmount"),
      className: "text-right tabular-nums",
      // The stored amount is always positive; the TYPE is the direction, so
      // the sign is rendered rather than read off the number.
      cell: (e) => (
        <span
          className={`font-mono text-sm font-medium ${
            e.type === "INCOME" ? "text-green-600" : "text-destructive"
          }`}
        >
          {e.type === "INCOME" ? "+" : "−"}
          {money(e.amount)}
        </span>
      ),
    },
    {
      id: "paymentMethod",
      header: t("finance.expenses.colPayment"),
      hideOnMobile: true,
      cell: (e) => <span className="text-muted-foreground text-sm">{e.paymentMethod ?? "—"}</span>,
    },
    {
      id: "description",
      header: t("finance.expenses.colDescription"),
      hideOnMobile: true,
      cell: (e) => (
        <span className="text-muted-foreground block max-w-[16rem] truncate text-sm">
          {e.description ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-20",
      cell: (e) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("admin.actions.edit")}
            onClick={(event) => {
              event.stopPropagation();
              setEditing(e);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("admin.actions.delete")}
            onClick={(event) => {
              event.stopPropagation();
              void remove(e);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <StatTiles
        tiles={[
          // display carries the currency; value still decides the colour.
          {
            label: t("finance.expenses.tiles.expense"),
            value: Number(summary.expense),
            display: money(summary.expense),
          },
          {
            label: t("finance.expenses.tiles.income"),
            value: Number(summary.income),
            display: money(summary.income),
          },
          {
            label: t("finance.expenses.tiles.net"),
            value: Number(summary.net),
            display: money(summary.net),
            tone: Number(summary.net) < 0 ? "critical" : undefined,
          },
          { label: t("finance.expenses.tiles.count"), value: summary.count },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowId={(e) => String(e.id)}
        loading={params.pending}
        onRowClick={(e) => setEditing(e)}
        empty={hasFilters ? t("finance.expenses.emptyFiltered") : t("finance.expenses.empty")}
        toolbar={
          <DataTableToolbar
            search={params.get("q")}
            onSearchChange={(v) => params.setFilter("q", v)}
            searchPlaceholder={t("finance.expenses.search")}
            hasFilters={hasFilters}
            onClearFilters={() =>
              params.clearFilters(["q", "type", "category", "vendor", "from", "to"])
            }
            filters={
              <>
                <Select
                  value={type || "ALL"}
                  onValueChange={(v) => params.setFilter("type", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue>
                      {type ? t(`finance.expenses.types.${type}`) : t("finance.expenses.allTypes")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("finance.expenses.allTypes")}</SelectItem>
                    <SelectItem value="EXPENSE">{t("finance.expenses.types.EXPENSE")}</SelectItem>
                    <SelectItem value="INCOME">{t("finance.expenses.types.INCOME")}</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={category || "ALL"}
                  onValueChange={(v) => params.setFilter("category", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue>
                      {categories.find((c) => String(c.id) === category)?.name ??
                        t("finance.expenses.allCategories")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("finance.expenses.allCategories")}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={vendor || "ALL"}
                  onValueChange={(v) => params.setFilter("vendor", !v || v === "ALL" ? "" : v)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue>
                      {vendors.find((x) => String(x.id) === vendor)?.name ??
                        t("finance.expenses.allVendors")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("finance.expenses.allVendors")}</SelectItem>
                    {vendors.map((x) => (
                      <SelectItem key={x.id} value={String(x.id)}>
                        {x.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Native date inputs: the platform already ships the picker,
                    the keyboard support and the locale format. */}
                <Input
                  type="date"
                  aria-label={t("finance.expenses.fFrom")}
                  className="w-36"
                  value={params.get("from")}
                  onChange={(e) => params.setFilter("from", e.target.value)}
                />
                <Input
                  type="date"
                  aria-label={t("finance.expenses.fTo")}
                  className="w-36"
                  value={params.get("to")}
                  onChange={(e) => params.setFilter("to", e.target.value)}
                />
              </>
            }
            actions={<Button onClick={() => setCreating(true)}>{t("finance.expenses.new")}</Button>}
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

      {(creating || editing) && (
        <EntryDialog
          entry={editing ?? undefined}
          categories={categories}
          vendors={vendors}
          open
          onOpenChange={(o) => {
            if (o) return;
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function CategoriesTab({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = async (category: CategoryRow) => {
    if (!window.confirm(t("finance.expenses.categoryDeleteConfirm"))) return;
    const result = await deleteCategoryAction(category.id);
    // "In use" is a refusal, not a failure: the alert says what to do about it.
    if (result && result.ok === false) {
      window.alert(t("finance.expenses.errCategoryInUse"));
      return;
    }
    router.refresh();
  };

  const columns: Column<CategoryRow>[] = [
    {
      id: "name",
      header: t("finance.expenses.colCategory"),
      cell: (c) => <span className="text-sm font-medium">{c.name}</span>,
    },
    {
      id: "type",
      header: t("finance.expenses.colType"),
      cell: (c) => (
        <Badge variant={c.type === "INCOME" ? "default" : "secondary"}>
          {t(`finance.expenses.types.${c.type}`)}
        </Badge>
      ),
    },
    {
      id: "entries",
      header: t("finance.expenses.colEntries"),
      className: "text-right tabular-nums",
      cell: (c) => c.entryCount,
    },
    {
      id: "note",
      header: t("finance.expenses.colNote"),
      hideOnMobile: true,
      cell: (c) => (
        <span className="text-muted-foreground block max-w-[20rem] truncate text-sm">
          {c.note ?? "—"}
        </span>
      ),
    },
    {
      id: "updatedAt",
      header: t("finance.expenses.colUpdated"),
      hideOnMobile: true,
      cell: (c) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {new Date(c.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("admin.actions.label")}</span>,
      className: "w-20",
      cell: (c) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("admin.actions.edit")}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(c);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("admin.actions.delete")}
            onClick={(e) => {
              e.stopPropagation();
              void remove(c);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const income = categories.filter((c) => c.type === "INCOME").length;

  return (
    <>
      <StatTiles
        tiles={[
          { label: t("finance.expenses.tiles.categories"), value: categories.length },
          { label: t("finance.expenses.tiles.incomeCategories"), value: income },
          {
            label: t("finance.expenses.tiles.expenseCategories"),
            value: categories.length - income,
          },
        ]}
      />

      <DataTable
        rows={categories}
        columns={columns}
        rowId={(c) => String(c.id)}
        onRowClick={(c) => setEditing(c)}
        empty={t("finance.expenses.categoriesEmpty")}
        toolbar={
          <div className="flex justify-end p-3">
            <Button onClick={() => setCreating(true)}>{t("finance.expenses.newCategory")}</Button>
          </div>
        }
      />

      {(creating || editing) && (
        <CategoryDialog
          category={editing ?? undefined}
          open
          onOpenChange={(o) => {
            if (o) return;
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
