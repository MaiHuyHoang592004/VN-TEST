"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";
import type { FulfillmentStatus } from "@gwprint/db";

import { PageTabs, StatusBadge, Surface } from "@/components/ds";
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
        <h1 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
          {t("fulfillment.quick.title")}
        </h1>
        <p className="mt-1 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
          {t("fulfillment.quick.subtitle")}
        </p>
        {/* The two workstations take no hero — a packer's scan field has to
            stay on the first screen — but they still need the section's other
            two routes one click away, which is what the navbar's tab column
            used to give them. A 32px strip is the hero's job at a twentieth of
            its height. */}
        <PageTabs section="/fulfillment" className="mt-3" />
      </header>

      {/* The scan target sits on the inset rung, as it does on the station. */}
      <Surface level="inset" radius="card" shadow="none" className="space-y-3 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-56 flex-1 space-y-1.5">
            <span className="font-sans text-(length:--fs-micro) font-semibold tracking-(--ls-label) text-(--text-label) uppercase">
              {t("fulfillment.scan.mode.tracking")}
            </span>
            <div className="relative">
              <ScanLine className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-(--icon-muted)" />
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
                // 48px and monospaced, for the same reason as the station.
                className="h-12 pl-11 font-mono text-(length:--fs-body-lg)"
              />
            </div>
          </div>

          <div className="w-52 space-y-1.5">
            <span className="font-sans text-(length:--fs-micro) font-semibold tracking-(--ls-label) text-(--text-label) uppercase">
              {t("fulfillment.quick.status")}
            </span>
            <Select value={status} onValueChange={(v) => setStatus(v as FulfillmentStatus)}>
              <SelectTrigger
                aria-label={t("fulfillment.quick.status")}
                className="h-12"
              >
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

          {/* The screen's one Action Blue, at 48px. */}
          <Button type="submit" size="lg" disabled={pending || !value.trim()}>
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
          <p
            role="alert"
            className="font-sans text-(length:--fs-body) font-semibold text-(--status-critical-fg)"
          >
            {error}
          </p>
        )}
      </Surface>

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
    <Surface level="data" radius="card" shadow="sm">
      <p className="font-sans text-(length:--fs-micro) font-semibold tracking-(--ls-label) text-(--text-label) uppercase">
        {label}
      </p>
      <p
        className={`mt-1 truncate ${
          mono
            ? "font-mono text-(length:--fs-body) font-semibold text-(--text-strong)"
            : "font-display text-(length:--fs-display-sm) font-(--fw-display-heavy) tabular-nums text-(--display-kpi)"
        }`}
      >
        {value}
      </p>
    </Surface>
  );
}

function QuickLog({ log }: { log: LogEntry[] }) {
  const { t } = useTranslation();

  if (!log.length) {
    return (
      <p className="rounded-(--radius-card) border border-dashed border-(--border-soft) bg-(--surface-inset) px-6 py-12 text-center font-sans text-(length:--fs-body) text-(--text-muted)">
        {t("fulfillment.quick.empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-(--radius-card) border border-(--border-soft) bg-(--surface-data)">
      <table className="w-full font-sans text-(length:--fs-body-sm)">
        <thead className="bg-(--surface-inset) text-(length:--fs-micro) text-(--text-label)">
          <tr className="tracking-(--ls-label) uppercase">
            <th className="px-3 py-2 text-left font-semibold">
              {t("fulfillment.quick.colCustomer")}
            </th>
            <th className="px-3 py-2 text-left font-semibold">
              {t("fulfillment.quick.colTracking")}
            </th>
            <th className="px-3 py-2 text-left font-semibold">
              {t("fulfillment.quick.colStatus")}
            </th>
            <th className="px-3 py-2 text-right font-semibold">
              {t("fulfillment.quick.colQty")}
            </th>
            <th className="px-3 py-2 text-left font-semibold">
              {t("fulfillment.quick.colProduct")}
            </th>
            <th className="px-3 py-2 text-left font-semibold">
              {t("fulfillment.quick.colNote")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--border-hairline)">
          {log.flatMap((entry) => [
            ...entry.rows.map((column) => (
              <tr key={`${entry.tracking}-${column.id}`}>
                <td className="px-3 py-2">{entry.customer ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-(length:--fs-meta)">
                  {entry.tracking}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={entry.status}>
                    {t(`orders.statuses.${entry.status}`)}
                  </StatusBadge>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {column.quantity}
                </td>
                <td className="px-3 py-2">
                  {[column.variant, column.product].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2 text-(--text-muted)">{entry.note ?? "—"}</td>
              </tr>
            )),
            // The column legacy never showed. A skip is the thing a supervisor
            // needs to see: it is an order that did NOT do what was asked.
            ...(entry.skipped.length
              ? [
                  <tr key={`${entry.tracking}-skipped`} className="bg-(--status-attention-bg)">
                    <td
                      colSpan={6}
                      className="px-3 py-2 text-(length:--fs-meta) text-(--status-attention-fg)"
                    >
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
