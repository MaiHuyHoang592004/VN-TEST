"use client";

import { useState } from "react";
import { LayoutGrid, List, Package, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n";

export type CatalogProduct = {
  id: number;
  name: string;
  key: string;
  thumbnail: string | null;
  skus: { id: number; variantName: string; sku: string | null; price: string }[];
};

/**
 * The seller's view of what they can order.
 *
 * Client-side search: this page already loads the whole (active) catalogue,
 * which is tens of products, so filtering in the browser is instant and a
 * round-trip per keystroke would be strictly worse. The admin tables page on
 * the server because a catalogue of thousands is a different problem.
 *
 * Prices arrive as strings already resolved to the viewer's tier — this
 * component never does arithmetic on money.
 */
export function CatalogBrowser({ products }: { products: CatalogProduct[] }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openId, setOpenId] = useState<number | null>(null);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.key.toLowerCase().includes(needle) ||
          p.skus.some((s) => s.variantName.toLowerCase().includes(needle)),
      )
    : products;

  /** Cheapest SKU — what a card leads with. String compare would rank "9.00"
   * above "12.00", so parse for the COMPARISON only; the displayed value is
   * always the untouched string. */
  const from = (p: CatalogProduct) =>
    p.skus.reduce((min, s) => (Number(s.price) < Number(min.price) ? s : min), p.skus[0]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("catalog.browse.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("catalog.browse.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("catalog.browse.search")}
              className="w-full pl-8 sm:w-64"
              aria-label={t("catalog.browse.search")}
            />
          </div>
          <div className="flex gap-1">
            <Button
              product={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              aria-label={t("catalog.browse.gridView")}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              product={view === "list" ? "secondary" : "ghost"}
              size="icon"
              aria-label={t("catalog.browse.listView")}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {needle ? t("catalog.browse.emptyFiltered") : t("catalog.browse.empty")}
        </p>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpenId(openId === p.id ? null : p.id)}
              aria-expanded={openId === p.id}
              className="border-border bg-background hover:border-foreground/20 flex flex-col overflow-hidden rounded-lg border text-left transition-colors"
            >
              <span className="bg-muted flex aspect-[4/3] items-center justify-center overflow-hidden">
                {p.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnail} alt="" className="size-full object-cover" />
                ) : (
                  <Package className="text-muted-foreground size-8" />
                )}
              </span>
              <span className="flex flex-1 flex-col gap-1 p-4">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-muted-foreground text-xs">
                  {/* No plural machinery in t(); one extra key beats "1 options"
                      on a page sellers actually look at. Languages without
                      plurals simply repeat the same word. */}
                  {p.skus.length}{" "}
                  {t(p.skus.length === 1 ? "catalog.browse.option" : "catalog.browse.options")}
                </span>
                <span className="mt-1 text-sm font-semibold tabular-nums">
                  {t("catalog.browse.from")} ${from(p).price}
                </span>
              </span>
              {openId === p.id && (
                <span className="border-border flex flex-col gap-1 border-t p-3">
                  {p.skus.map((s) => (
                    <span key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{s.variantName}</span>
                      <span className="font-mono tabular-nums">${s.price}</span>
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
          {filtered.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {p.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt=""
                    className="border-border size-10 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
                    <Package className="size-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">{p.key}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.skus.map((s) => (
                  <Badge key={s.id} product="secondary" className="font-normal">
                    {s.variantName}
                    <span className="ml-1.5 font-mono tabular-nums">${s.price}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
