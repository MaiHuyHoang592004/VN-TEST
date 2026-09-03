"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { resolveSkusAction } from "@/modules/catalog/variant-variants/actions";
import { createOrdersAction } from "@/modules/fulfillment/orders/actions";

import { COLUMN_ALIASES, TEMPLATE_HEADERS, parseCsv } from "./import-columns";

type RowResult = { column: number; ok: boolean; error?: string };

/** Rows per request. Keeps a big paste off one long-running action without
 * making the whole file one transaction — each column commits independently. */
const BATCH = 50;

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
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const csv = `${TEMPLATE_HEADERS.join(",")}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    setResults(null);
    setParseError(null);
    const table = parseCsv(await file.text());
    if (table.length < 2) {
      setParseError(t("orders.importEmpty"));
      setRows([]);
      return;
    }
    const headers = table[0].map((h) => COLUMN_ALIASES[h.trim()] ?? h.trim());
    setRows(
      table.slice(1).map((cells) =>
        Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])),
      ),
    );
  };

  const run = async () => {
    setBusy(true);
    // Resolve every SKU reference first, in one round trip, so a bad reference
    // is reported as "column 4: no such SKU" rather than a generic failure.
    const ids = await resolveSkusAction(
      rows.map((r) => ({ sku: r.sku, variant: r.variant, product: r.product })),
    );

    const all: RowResult[] = [];
    for (let start = 0; start < rows.length; start += BATCH) {
      const slice = rows.slice(start, start + BATCH);
      const payload: Record<string, unknown>[] = [];
      const rowIndex: number[] = [];

      slice.forEach((r, i) => {
        const abs = start + i;
        if (ids[abs] === null) {
          all.push({ column: abs, ok: false, error: t("orders.importNoSku") });
          return;
        }
        payload.push({ ...r, quantity: Number(r.quantity) || 1, productVariantId: ids[abs] });
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

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("orders.importTitle")}
      description={t("orders.importDesc")}
      submitLabel={results ? t("orders.importDone") : t("orders.importSubmit")}
      pending={busy}
      submitDisabled={!results && rows.length === 0}
      onSubmit={() => (results ? onOpenChange(false) : run())}
    >
      {!results ? (
        <div className="flex flex-col gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
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
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <FileText className="size-4" />
              {t("orders.importReady").replace("{count}", String(rows.length))}
            </p>
          )}

          <Button type="button" product="ghost" size="sm" onClick={downloadTemplate} className="w-fit">
            <Download className="mr-1.5 size-4" />
            {t("orders.importTemplate")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Badge>{t("orders.importCreated").replace("{count}", String(created))}</Badge>
            {failed.length > 0 && (
              <Badge product="destructive">
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
