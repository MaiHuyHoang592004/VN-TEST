"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, TriangleAlert, Upload } from "lucide-react";

import { Callout } from "@/components/ds";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { resolveSkusAction } from "@/modules/catalog/product-variants/actions";
import { createOrdersAction } from "@/modules/fulfillment/orders/actions";

import { COLUMN_ALIASES, PREVIEW_COLUMNS, TEMPLATE_HEADERS, parseCsv } from "./import-columns";

type RowResult = { column: number; ok: boolean; error?: string };

/** Rows per request. Keeps a big paste off one long-running action without
 * making the whole file one transaction — each column commits independently. */
const BATCH = 50;

/** Rows shown in the preview. A 5,000-row file is a legitimate import and an
 * illegitimate DOM: the point of the preview is "did I upload the right file
 * and are the columns lined up", which the first handful answers. */
const PREVIEW_ROWS = 8;

/**
 * Spreadsheet import.
 *
 * The column loop runs SERVER-side, one transaction per column: legacy looped in the
 * browser, so closing the tab half way through left some orders created, the
 * rest lost, and nothing to tell you which. Here the browser only parses and
 * posts batches; a closed tab stops the import but never corrupts it.
 *
 * Every column is validated by the SAME zod schema the form uses, so "column 4 is
 * invalid" means exactly what the form would have said about it.
 */
export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  /** One entry per parsed row: the resolved variant id, or null for "no SKU
   * matches". Resolved at PARSE time, not at import time — a bad reference is
   * something you want to see before you commit, not in the failure report
   * afterwards. */
  const [skuIds, setSkuIds] = useState<(number | null)[]>([]);
  const [checking, setChecking] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** Guards against a second file chosen while the first is still resolving:
   * only the newest parse may write state. */
  const parseToken = useRef(0);

  const downloadTemplate = () => {
    const csv = `${TEMPLATE_HEADERS.join(",")}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders-template.csv";
    a.click();
    // Revoked on the NEXT tick, not synchronously: Firefox and Safari have not
    // necessarily started reading the blob when click() returns, and tearing
    // the object URL down under them aborts the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const onFile = async (file: File) => {
    const token = ++parseToken.current;
    setFileName(file.name);
    setResults(null);
    setParseError(null);
    setSkuIds([]);
    const table = parseCsv(await file.text());
    if (token !== parseToken.current) return;
    if (table.length < 2) {
      setParseError(t("orders.importEmpty"));
      setRows([]);
      return;
    }
    const headers = table[0].map((h) => COLUMN_ALIASES[h.trim()] ?? h.trim());
    const parsed = table.slice(1).map((cells) =>
      Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])),
    );
    setRows(parsed);

    // Resolve every SKU reference here rather than inside the import, so the
    // preview can mark a bad reference BEFORE anything is committed.
    setChecking(true);
    try {
      const ids = await resolveSkusAction(
        parsed.map((r) => ({ sku: r.sku, variant: r.variant, product: r.product })),
      );
      if (token === parseToken.current) setSkuIds(ids);
    } finally {
      if (token === parseToken.current) setChecking(false);
    }
  };

  const run = async () => {
    setBusy(true);
    // Already resolved at parse time — one round trip, and the same ids the
    // preview marked up, so what was flagged is exactly what is skipped.
    const ids = skuIds;

    const all: RowResult[] = [];
    for (let start = 0; start < rows.length; start += BATCH) {
      const slice = rows.slice(start, start + BATCH);
      const payload: Record<string, unknown>[] = [];
      const rowIndex: number[] = [];

      slice.forEach((r, i) => {
        const abs = start + i;
        // `?? null` also covers a resolve that never returned an entry for
        // this row: a missing id is a missing SKU, not a row to post blind.
        if ((ids[abs] ?? null) === null) {
          all.push({ column: abs, ok: false, error: t("orders.importNoSku") });
          return;
        }
        // Send exactly what the cell held. `|| 1` used to turn 0/blank/garbage
        // into a silent 1 — the server's real validation, and the per-row
        // error this dialog already renders, could never see the real value.
        payload.push({ ...r, quantity: Number(r.quantity), productVariantId: ids[abs] });
        rowIndex.push(abs);
      });

      if (payload.length) {
        const res = await createOrdersAction(payload);
        res.results.forEach((r, i) =>
          all.push({ column: rowIndex[i], ok: r.ok, error: r.error }),
        );
      }
    }

    setResults(all.sort((a, b) => a.column - b.column));
    setBusy(false);
    router.refresh();
  };

  const failed = results?.filter((r) => !r.ok) ?? [];
  const created = results?.filter((r) => r.ok).length ?? 0;
  /** Row indexes whose SKU reference resolved to nothing. */
  const unresolved = rows
    .map((_, i) => i)
    .filter((i) => skuIds.length > 0 && (skuIds[i] ?? null) === null);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("orders.importTitle")}
      description={t("orders.importDesc")}
      submitLabel={results ? t("orders.importDone") : t("orders.importSubmit")}
      pending={busy}
      // Nothing to import, or the SKU check is still running — importing
      // mid-check would post rows the preview has not finished judging.
      submitDisabled={!results && (rows.length === 0 || checking)}
      onSubmit={() => (results ? onOpenChange(false) : run())}
    >
      {!results ? (
        <div className="flex flex-col gap-4">
          {/* `hidden`, not `sr-only`: an sr-only input is still focusable and
              still in the tab order, so a keyboard or screen-reader user landed
              on an unlabelled file field that is not the way in — the big
              labelled button below is. Same treatment as ArtworkDialog's.
              The value is cleared on every change so re-picking the SAME
              filename after a parse error still fires a change event. */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border-border hover:border-foreground/30 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 transition-colors"
          >
            <Upload className="text-muted-foreground size-6" />
            <span className="text-sm font-medium">
              {fileName || t("orders.importChoose")}
            </span>
            <span className="text-muted-foreground text-xs">{t("orders.importCsvOnly")}</span>
          </button>

          {parseError && <p className="text-destructive text-sm">{parseError}</p>}

          {rows.length > 0 && (
            <>
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <FileText className="size-4" />
                {t("orders.importReady").replace("{count}", String(rows.length))}
                {checking && <span>· {t("orders.importChecking")}</span>}
              </p>

              {/* The file, read back. Column headers are the TEMPLATE's own
                  text — see PREVIEW_COLUMNS — so a mis-mapped column reads as
                  an empty cell under the header the operator actually typed. */}
              {/* overflow-x-AUTO, not hidden: this is five-plus columns inside
                  an sm:max-w-lg dialog, and clipping them crushed and wrapped
                  every cell instead of letting the preview scroll. */}
              <div className="border-border overflow-x-auto rounded-md border">
                <table className="w-full min-w-md border-collapse text-left">
                  <thead>
                    <tr>
                      {PREVIEW_COLUMNS.map((c) => (
                        <th
                          key={c.field}
                          scope="col"
                          className={`text-muted-foreground border-border border-b px-3 py-2 text-(length:--fs-micro) font-bold tracking-(--ls-caps) uppercase ${
                            c.numeric ? "text-right" : ""
                          }`}
                        >
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                      <tr key={i} className="border-border border-b last:border-b-0">
                        {PREVIEW_COLUMNS.map((c) => {
                          // Only the SKU cell carries the "no match" mark: it
                          // is the cell that has to change for the row to
                          // import.
                          const bad = c.field === "sku" && (skuIds[i] ?? null) === null && !checking && skuIds.length > 0;
                          return (
                            <td
                              key={c.field}
                              className={`px-3 py-2 text-(length:--fs-meta) ${
                                c.mono ? "font-mono tracking-(--ls-mono)" : ""
                              } ${c.numeric ? "text-right" : ""} ${bad ? "text-destructive font-medium" : ""}`}
                            >
                              {r[c.field] || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rows.length > PREVIEW_ROWS && (
                <p className="text-muted-foreground text-xs">
                  {t("orders.importPreviewMore").replace(
                    "{count}",
                    String(rows.length - PREVIEW_ROWS),
                  )}
                </p>
              )}

              {unresolved.length > 0 && (
                <Callout
                  tone="critical"
                  icon={<TriangleAlert />}
                  title={t("orders.importUnresolved").replace(
                    "{count}",
                    String(unresolved.length),
                  )}
                >
                  {/* +2: humans count from 1 AND the header is line 1, so the
                      number matches what they see in their spreadsheet. */}
                  {t("orders.importUnresolvedLines").replace(
                    "{lines}",
                    unresolved
                      .slice(0, 5)
                      .map((i) => i + 2)
                      .join(", "),
                  )}{" "}
                  {t("orders.importNoSku")}
                </Callout>
              )}
            </>
          )}

          <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate} className="w-fit">
            <Download className="mr-1.5 size-4" />
            {t("orders.importTemplate")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Badge>{t("orders.importCreated").replace("{count}", String(created))}</Badge>
            {failed.length > 0 && (
              <Badge variant="destructive">
                {t("orders.importFailed").replace("{count}", String(failed.length))}
              </Badge>
            )}
          </div>
          {failed.length > 0 && (
            <div className="border-border max-h-56 divide-y divide-border overflow-y-auto rounded-md border">
              {failed.map((r) => (
                <p key={r.column} className="px-3 py-2 text-xs">
                  {/* +2: humans count from 1 AND the header is line 1, so the
                      number matches what they see in their spreadsheet. */}
                  <span className="font-medium">
                    {t("orders.importLine").replace("{line}", String(r.column + 2))}
                  </span>{" "}
                  <span className="text-muted-foreground">{r.error}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </FormDialog>
  );
}
