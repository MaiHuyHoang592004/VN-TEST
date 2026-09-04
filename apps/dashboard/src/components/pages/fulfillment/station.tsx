"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Surface } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";
// A TYPE-only import: it is erased at compile time, so pulling the shape from
// the service does NOT drag prisma and the pg driver into the client bundle
// (the mistake order-status-actions.tsx documents). Values must never be
// imported from a service here — only actions and pure data like status.ts.
import type { TrackingGroup } from "@/modules/fulfillment/stations/service";

import { ScanInput } from "./scan-input";
import { CameraPanel } from "./camera-panel";
import { GroupSummary } from "./group-summary";
import { OrderCardGrid } from "./order-card-grid";
import { StationActions } from "./station-actions";
import { AlreadyScannedDialog } from "./already-scanned-dialog";

export type StationGroup = TrackingGroup;

/**
 * The station's state machine. It holds exactly one thing — the parcel in
 * hand — and every child either replaces it or acts on it.
 *
 * A refresh of the group after each mutation comes from the SERVER's returned
 * group rather than being patched locally: the floor is the one place where a
 * screen quietly disagreeing with the database gets a real parcel shipped
 * wrong.
 */
export function Station() {
  const { t } = useTranslation();
  const [group, setGroup] = useState<StationGroup | null>(null);
  const [warnScanned, setWarnScanned] = useState(false);
  /** Sticky, not a toast: a parcel with nowhere to go is a floor problem that
   * has to be resolved, not dismissed. */
  const [blocker, setBlocker] = useState<string | null>(null);

  const load = useCallback(
    (next: StationGroup, opts: { warnIfScanned?: boolean } = {}) => {
      setGroup(next);
      setBlocker(null);
      if (opts.warnIfScanned && next.orders.some((o) => o.wasScanned)) setWarnScanned(true);
    },
    [],
  );

  const clear = useCallback(() => {
    setGroup(null);
    setWarnScanned(false);
    setBlocker(null);
  }, []);

  return (
    <div className="pb-28">
      <header className="mb-6">
        <h1 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
          {t("fulfillment.station.title")}
        </h1>
        <p className="mt-1 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
          {t("fulfillment.station.subtitle")}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <ScanInput
            onScanned={(g) => load(g, { warnIfScanned: true })}
            onCleared={clear}
          />

          {blocker && (
            <p
              role="alert"
              className="rounded-(--radius-card) border border-(--status-critical-bg) bg-(--status-critical-bg) px-4 py-3 font-sans text-(length:--fs-body) font-semibold text-(--status-critical-fg)"
            >
              {blocker}
            </p>
          )}

          {group ? (
            <>
              <GroupSummary group={group} />
              <OrderCardGrid group={group} onGroup={load} onBlocked={setBlocker} />
            </>
          ) : (
            <Surface
              level="inset"
              radius="card"
              shadow="none"
              className="border border-dashed border-(--border-soft) px-6 py-16 text-center font-sans text-(length:--fs-body) text-(--text-muted)"
            >
              {t("fulfillment.station.idle")}
            </Surface>
          )}
        </div>

        <CameraPanel
          group={group}
          onScanned={(g) => load(g, { warnIfScanned: true })}
          onGroup={load}
        />
      </div>

      {group && (
        <StationActions
          group={group}
          onGroup={load}
          onShipped={(labelUrl) => {
            if (labelUrl) window.open(labelUrl, "_blank", "noopener");
            toast.success(t("fulfillment.station.handoffDone"));
            clear();
          }}
        />
      )}

      {warnScanned && group && (
        <AlreadyScannedDialog
          group={group}
          onContinue={() => setWarnScanned(false)}
          // Cancel clears the search rather than reloading the window, which
          // is what legacy did — a full reload on a station also throws away
          // the camera stream and the operator's place in the queue.
          onCancel={clear}
        />
      )}
    </div>
  );
}
