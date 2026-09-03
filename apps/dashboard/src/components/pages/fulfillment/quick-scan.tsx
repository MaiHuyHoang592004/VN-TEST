"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";
import type { FulfillmentStatus } from "@opcreative/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n";
import { truncateTracking } from "@/modules/fulfillment/stations/schema";
import { quickUpdateAction } from "@/modules/fulfillment/stations/actions";

const STATUSES: FulfillmentStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PRODUCTION",
  "FULFILLED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "ON_HOLD",
];

type LogEntry = {
  tracking: string;
  customer: string | null;
  status: FulfillmentStatus;
  rows: Array<{ id: number; externalId: string | null; quantity: number; variant: string | null; product: string | null }>;
  skipped: Array<{ id: number; externalId: string | null; reason: string }>;
  note?: string;
};

/**
 * Scan, apply, repeat.
 *
 * Every status is offered rather than only the legal ones: this screen works a
 * PILE, and the parcels in it are not all in the same state. The service
 * checks each column against the transition map on its own, so an ineligible
 * order is skipped and named instead of blocking the batch — and the log below
 * shows the skips, which is the part legacy got wrong. It reported everything
 * it matched as updated, including rows it had written an illegal status onto.
 */
export function QuickScan() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<FulfillmentStatus>("IN_PRODUCTION");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Session-scoped: this is a shift's tally, not a report. It resets when the
   * page does, which is what the floor expects of a counter on a wall. */
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const keyword = truncateTracking(value.trim());
    if (keyword.length < 10) {
      setError(t("fulfillment.scan.tooShort"));
      return;
    }
    setError(null);
    setPending(true);
    const result = await quickUpdateAction({ keyword, to: status, note: note.trim() || undefined });
    setPending(false);

    if ("error" in result) {
      setError(t(`fulfillment.errors.${result.error}`));
      return;
    }

    const entry: LogEntry = {
      tracking: result.trackingNumber ?? keyword,
      customer: result.customer,
      status,
      rows: result.rows.map((r) => ({
        id: r.id,
        externalId: r.externalId,
        quantity: r.quantity,
        variant: r.variant,
        product: r.product,
      })),
      skipped: result.skipped,
      note: note.trim() || undefined,
    };
    // Re-scanning a parcel REPLACES its rows rather than appending: the tally
    // counts parcels handled, and a worker who scans the same box twice has
    // not handled two.
    setLog((prev) => [entry, ...prev.filter((e) => e.tracking !== entry.tracking)]);
    setValue("");
    inputRef.current?.focus();
    toast.success(t("fulfillment.quick.applied").replace("{count}", String(result.updated)));
  };

  const parcels = log.length;
  const updated = log.reduce((n, e) => n + e.rows.length - e.skipped.length, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("fulfillment.quick.title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("fulfillment.quick.subtitle")}</p>
      </header>

      <div className="border-border bg-card space-y-3 rounded-lg border p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-56 flex-1 space-y-1.5">
            <span className="text-sm font-medium">{t("fulfillment.scan.mode.tracking")}</span>
            <div className="relative">
              <ScanLine className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => setTimeout(() => inputRef.current?.focus(), 0)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                maxLength={60}
                placeholder={t("fulfillment.scan.placeholder.tracking")}
                aria-label={t("fulfillment.scan.placeholder.tracking")}
                aria-invalid={error ? true : undefined}
                className="pl-9 font-mono"
              />
            </div>
          </div>

          <div className="w-52 space-y-1.5">
            <span className="text-sm font-medium">{t("fulfillment.quick.status")}</span>
            <Select value={status} onValueChange={(v) => setStatus(v as FulfillmentStatus)}>
              <SelectTrigger aria-label={t("fulfillment.quick.status")}>
                <SelectValue>{t(`orders.statuses.${status}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`orders.statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={pending || !value.trim()}>
            {pending ? <Spinner className="size-4" /> : t("fulfillment.quick.submit")}
          </Button>
        </form>

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t("fulfillment.quick.note")}
          aria-label={t("fulfillment.quick.note")}
        />

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label={t("fulfillment.quick.lastScanned")} value={log[0]?.tracking ?? "—"} mono />
        <Tile label={t("fulfillment.quick.parcels")} value={String(parcels)} />
        <Tile label={t("fulfillment.quick.updated")} value={String(updated)} />
      </div>

      <QuickLog log={log} />
    </div>
  );
}

function Tile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-1 truncate text-lg font-semibold ${mono ? "font-mono text-sm" : "tabular-nums"}`}>
        {value}
      </p>
    </div>
  );
}

function QuickLog({ log }: { log: LogEntry[] }) {
  const { t } = useTranslation();

  if (!log.length) {
    return (
      <p className="border-border text-muted-foreground rounded-lg border border-dashed px-6 py-12 text-center text-sm">
        {t("fulfillment.quick.empty")}
      </p>
    );
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t("fulfillment.quick.colCustomer")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("fulfillment.quick.colTracking")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("fulfillment.quick.colStatus")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("fulfillment.quick.colQty")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("fulfillment.quick.colProduct")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("fulfillment.quick.colNote")}</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {log.flatMap((entry) => [
            ...entry.rows.map((column) => (
              <tr key={`${entry.tracking}-${column.id}`}>
                <td className="px-3 py-2">{entry.customer ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{entry.tracking}</td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{t(`orders.statuses.${entry.status}`)}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{column.quantity}</td>
                <td className="px-3 py-2">
                  {[column.variant, column.product].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="text-muted-foreground px-3 py-2">{entry.note ?? "—"}</td>
              </tr>
            )),
            // The column legacy never showed. A skip is the thing a supervisor
            // needs to see: it is an order that did NOT do what was asked.
            ...(entry.skipped.length
              ? [
                  <tr key={`${entry.tracking}-skipped`} className="bg-vercel-yellow/5">
                    <td colSpan={6} className="text-vercel-orange px-3 py-2 text-xs">
                      {t("fulfillment.quick.skipped").replace(
                        "{orders}",
                        entry.skipped
                          .map((s) => `${s.externalId ?? `#${s.id}`} (${t(`fulfillment.errors.${s.reason}`)})`)
                          .join(", "),
                      )}
                    </td>
                  </tr>,
                ]
              : []),
          ])}
        </tbody>
      </table>
    </div>
  );
}
