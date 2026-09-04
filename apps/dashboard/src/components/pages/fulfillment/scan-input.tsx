"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";

import { Surface } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n";
import { TRACKING_LENGTH, truncateTracking } from "@/modules/fulfillment/stations/schema";
import { recordScanAction } from "@/modules/fulfillment/stations/actions";

import { ConfirmScanDialog } from "./confirm-scan-dialog";
import type { StationGroup } from "./station";

type Mode = "tracking" | "order";

/**
 * The way work arrives at the station.
 *
 * THE KEYBOARD IS THE PRIMARY INPUT. A barcode gun is a keyboard that types
 * fast and presses Enter, so this is a plain text field that keeps itself
 * focused — the camera below is a convenience for phones, not the main path.
 * An input that loses focus after every scan means a worker holding a parcel
 * has to put it down and click, which is how a floor ends up not scanning.
 */
export function ScanInput({
  onScanned,
  onCleared,
}: {
  onScanned: (group: StationGroup) => void;
  onCleared: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("tracking");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<{ count: number; value: string } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const submit = async (raw: string, confirmed = false) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (mode === "tracking" && trimmed.length < 10) {
      setError(t("fulfillment.scan.tooShort"));
      return;
    }
    if (mode === "order" && !/^\d+$/.test(trimmed)) {
      setError(t("fulfillment.scan.notAnId"));
      return;
    }
    setError(null);

    // Carriers print more than the number in one barcode; the number is the
    // last 22 characters. Silently, exactly as the floor is used to.
    const scanned = mode === "tracking" ? truncateTracking(trimmed) : trimmed;

    setPending(true);
    const result = await recordScanAction({ mode, value: scanned, confirmed });
    setPending(false);

    if ("error" in result) {
      setError(t(`fulfillment.errors.${result.error}`));
      return;
    }
    if (result.requiresConfirmation) {
      setConfirm({ count: result.requiresConfirmation.count, value: scanned });
      return;
    }
    if (result.group) {
      setValue("");
      onScanned(result.group);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {/* The scan target is the workstation's one job, so it sits on the
          inset rung: a pale sky well inside the white data surface. */}
      <Surface level="inset" radius="card" shadow="none" className="p-4">
        <div className="mb-3 flex items-center gap-1">
          {(["tracking", "order"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              aria-pressed={mode === m}
              className={`rounded-(--radius-pill) px-3 py-1.5 font-sans text-(length:--fs-body) font-semibold transition-colors duration-(--dur-fast) ease-(--ease-out) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none ${
                mode === m
                  ? "bg-sky-200 text-navy-700"
                  : "text-navy-500 hover:bg-sky-100 hover:text-navy-700"
              }`}
            >
              {t(`fulfillment.scan.mode.${m}`)}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(value);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-(--icon-muted)" />
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              // A gun fires wherever the cursor is. Taking focus back means the
              // next parcel scans into the field rather than into nothing.
              onBlur={() => setTimeout(() => inputRef.current?.focus(), 0)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              inputMode={mode === "order" ? "numeric" : "text"}
              maxLength={60}
              placeholder={t(`fulfillment.scan.placeholder.${mode}`)}
              aria-label={t(`fulfillment.scan.placeholder.${mode}`)}
              aria-invalid={error ? true : undefined}
              // 48px, monospaced: this field receives barcodes and order IDs,
              // and it is read standing up at arm's length.
              className="h-12 pl-11 font-mono text-(length:--fs-body-lg)"
            />
          </div>
          {/* The one Action Blue on the station: scan. lg because it is hit
              with a glove or a scanner trigger. */}
          <Button type="submit" size="lg" disabled={pending || !value.trim()}>
            {pending ? <Spinner className="size-4" /> : t("fulfillment.scan.submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => {
              setValue("");
              setError(null);
              onCleared();
              inputRef.current?.focus();
            }}
          >
            {t("fulfillment.scan.clear")}
          </Button>
        </form>

        {error ? (
          <p
            role="alert"
            className="mt-2 font-sans text-(length:--fs-body) font-semibold text-(--status-critical-fg)"
          >
            {error}
          </p>
        ) : (
          <p className="mt-2 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
            {mode === "tracking"
              ? t("fulfillment.scan.hintTracking").replace("{n}", String(TRACKING_LENGTH))
              : t("fulfillment.scan.hintOrder")}
          </p>
        )}
      </Surface>

      {confirm && (
        <ConfirmScanDialog
          count={confirm.count}
          onCancel={() => {
            setConfirm(null);
            toast.message(t("fulfillment.scan.cancelled"));
            inputRef.current?.focus();
          }}
          onConfirm={() => {
            const pendingValue = confirm.value;
            setConfirm(null);
            void submit(pendingValue, true);
          }}
        />
      )}
    </>
  );
}
