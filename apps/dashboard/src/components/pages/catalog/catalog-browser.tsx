"use client";

import { useState } from "react";
import { LayoutGrid, List, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProductCell, SearchField, Surface } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";
import { money } from "@/lib/money";

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
  // DEFENSIVE, not a bug fix — the earlier comment here claimed the opposite
  // and was wrong. The page filters `products.filter((p) => p.skus.length > 0)`
  // before this component ever sees them, and it builds `skus` from variants
  // that are ACTIVE and priced, so a product whose variants are all inactive
  // never renders a card at all. Empty `skus` is reachable through the TYPE,
  // never through the current caller. The guard stays because the type permits
  // it and reduce() with p.skus[0] as its seed would return undefined here,
  // but nothing was crashing.
  const from = (p: CatalogProduct) =>
    p.skus.length === 0
      ? null
      : p.skus.reduce((min, s) => (Number(s.price) < Number(min.price) ? s : min), p.skus[0]);

  return (
    <>
      {/* The DS's SearchShell: the search row sits ON the cream brand surface,
          with the view toggle in its action slot. */}
      <Surface
        level="content"
        radius="card"
        shadow="none"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <SearchField
          value={q}
          onChange={setQ}
          placeholder={t("catalog.browse.search")}
          aria-label={t("catalog.browse.search")}
          className="w-full sm:w-72"
        />
        <div className="flex shrink-0 gap-1">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label={t("catalog.browse.gridView")}
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label={t("catalog.browse.listView")}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List className="size-4" />
          </Button>
        </div>
      </Surface>

      {/* The search filters in the browser, so the visible row count changes
          with no navigation and nothing to announce. This says how many are
          left. */}
      <p aria-live="polite" className="sr-only">
        {t("catalog.browse.resultCount").replace("{count}", String(filtered.length))}
      </p>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-(length:--fs-body-sm) text-(--text-muted)">
          {needle ? t("catalog.browse.emptyFiltered") : t("catalog.browse.empty")}
        </p>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            // The card is a CONTAINER; only its header is the button. The SKU
            // list used to sit INSIDE that button, which made the button's
            // accessible name the whole card — every variant and every price
            // included — and made that name grow as you expanded it. Header
            // toggles, sibling region holds, aria-controls ties them together.
            //
            // Surface renders a <section>, so this card carries level="data"'s
            // own tokens rather than nesting one element inside the other.
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-(--radius-card) bg-(--surface-data) text-left shadow-(--shadow-xs) transition-shadow duration-(--dur-fast) ease-(--ease-out) hover:shadow-(--shadow-sm) motion-reduce:transition-none"
            >
              <button
                type="button"
                onClick={() => setOpenId(openId === p.id ? null : p.id)}
                aria-expanded={openId === p.id}
                aria-controls={`catalog-skus-${p.id}`}
                className="flex flex-1 flex-col rounded-(--radius-card) text-left focus-visible:shadow-(--shadow-focus) focus-visible:outline-none"
              >
                {/* The cream product well — the DS's one sanctioned warm surface
                    on an operational screen, and never a grey one. */}
                <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-(--surface-content)">
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail} alt="" className="size-full object-cover" />
                  ) : (
                    <Package className="size-8 stroke-(--icon-muted)" />
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-1 p-4">
                  <span className="truncate text-(length:--fs-body-sm) font-semibold text-(--text-body)">
                    {p.name}
                  </span>
                  <span className="font-mono text-(length:--fs-micro) tracking-(--ls-mono) text-(--text-muted)">
                    {p.key}
                  </span>
                  <span className="text-(length:--fs-meta) text-(--text-muted)">
                    {/* No plural machinery in t(); one extra key beats "1 options"
                        on a page sellers actually look at. Languages without
                        plurals simply repeat the same word. */}
                    {p.skus.length}{" "}
                    {t(p.skus.length === 1 ? "catalog.browse.option" : "catalog.browse.options")}
                  </span>
                  {/* A product with no active variant has no price to quote, and
                      an em dash is the honest answer. Reading .price off the
                      empty-array case is what used to throw during render. */}
                  {(() => {
                    const cheapest = from(p);
                    return cheapest ? (
                      <span className="mt-1 text-(length:--fs-body-sm) font-semibold text-(--text-body)">
                        {t("catalog.browse.from")}{" "}
                        <span className="font-mono tracking-(--ls-mono) tabular-nums">
                          {money(cheapest.price)}
                        </span>
                      </span>
                    ) : (
                      <span className="mt-1 font-mono text-(length:--fs-body-sm) text-(--text-muted)">
                        —
                      </span>
                    );
                  })()}
                </span>
              </button>

              {openId === p.id && (
                <div
                  id={`catalog-skus-${p.id}`}
                  className="flex flex-col gap-1 border-t border-(--border-hairline) p-3"
                >
                  {p.skus.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 text-(length:--fs-meta)"
                    >
                      <span className="truncate text-(--text-body)">{s.variantName}</span>
                      <span className="font-mono tracking-(--ls-mono) tabular-nums">
                        {money(s.price)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Surface pad={false} radius="card" shadow="xs" className="overflow-hidden">
          <div className="divide-y divide-(--border-hairline)">
            {filtered.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <ProductCell
                  className="min-w-0 flex-1"
                  name={p.name}
                  code={p.key}
                  image={
                    p.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail} alt="" />
                    ) : (
                      <span className="flex size-full items-center justify-center">
                        <Package className="size-4 stroke-(--icon-muted)" />
                      </span>
                    )
                  }
                />
                <div className="flex flex-wrap gap-1.5">
                  {p.skus.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center rounded-(--radius-pill) bg-(--surface-inset) px-2.5 py-1 text-(length:--fs-meta) text-(--text-body)"
                    >
                      {s.variantName}
                      <span className="ml-1.5 font-mono tracking-(--ls-mono) tabular-nums">
                        {money(s.price)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      )}
    </>
  );
}
