"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronDown, PackageCheck, Tag } from "lucide-react";
import type { FulfillmentStatus } from "@opcreative/db";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can } from "@/components/global/permission-gate";
import { useTranslation } from "@/lib/i18n";
import { allowedTransitions } from "@/modules/fulfillment/orders/status";
import { updateStatusAction } from "@/modules/fulfillment/orders/actions";
import { refreshGroupAction } from "@/modules/fulfillment/stations/actions";

import { HandoffDialog } from "./handoff-dialog";
import { LinkLabelDialog } from "./link-label-dialog";
import { useProofUpload } from "./use-proof-upload";
import type { StationGroup } from "./station";

/**
 * The bench's controls, pinned to the bottom because they are what an operator
 * reaches for with a parcel in one hand: photograph it, hand it over, or move
 * the whole thing.
 *
 * Everything here is size="lg" (48px): the station is used standing up, at
 * arm's length, with a glove or a scanner trigger. Destructive moves stay on
 * the DS's `destructive` variant — a white pill with red ink, never a filled
 * red target sitting next to a filled blue one.
 */
export function StationActions({
  group,
  onGroup,
  onShipped,
}: {
  group: StationGroup;
  onGroup: (group: StationGroup) => void;
  onShipped: (labelUrl: string | null) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [linking, setLinking] = useState(false);
  const { upload, overwritePrompt } = useProofUpload(group, onGroup);

  // Only moves legal for EVERY piece: a parcel where half is fulfilled and
  // half is in production shares no move, and offering one would mean half the
  // batch silently failing.
  const common = group.orders.reduce<FulfillmentStatus[] | null>((acc, order) => {
    const next = allowedTransitions(order.status as FulfillmentStatus);
    return acc === null ? next : acc.filter((s) => next.includes(s));
  }, null);
  const options = common ?? [];

  const moveAll = async (to: FulfillmentStatus) => {
    setPending(true);
    const results = await Promise.all(group.orders.map((o) => updateStatusAction(o.id, to)));
    const failed = results.filter((r) => !r.ok).length;
    const fresh = await refreshGroupAction({ orderId: group.orders[0].id });
    setPending(false);
    if (fresh) onGroup(fresh);
    if (failed) {
      toast.error(
        t("orders.statusPartial")
          .replace("{failed}", String(failed))
          .replace("{total}", String(group.orders.length)),
      );
    } else {
      toast.success(
        t("orders.statusMoved")
          .replace("{count}", String(group.orders.length))
          .replace("{status}", t(`orders.statuses.${to}`)),
      );
    }
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-(--border-hairline) bg-(--surface-data)">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-6 py-3 lg:px-20">
          <span className="mr-auto font-sans text-(length:--fs-body) text-(--text-muted)">
            {t("fulfillment.actions.summary")
              .replace("{orders}", String(group.orders.length))
              .replace("{units}", String(group.orders.reduce((n, o) => n + o.quantity, 0)))}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="lg"
                  disabled={pending || options.length === 0}
                >
                  {t("fulfillment.actions.updateAll")}
                  <ChevronDown className="ml-1 size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {options.length === 0 ? (
                <DropdownMenuItem disabled>{t("orders.noCommonMove")}</DropdownMenuItem>
              ) : (
                options.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    variant={s === "CANCELLED" ? "destructive" : undefined}
                    onClick={() => moveAll(s)}
                  >
                    {t(`orders.statuses.${s}`)}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Can permission="orders.labels.manage">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setLinking(true)}
              disabled={pending}
            >
              <Tag className="size-4" />
              {t("fulfillment.actions.linkLabel")}
            </Button>
          </Can>

          {/* `capture="environment"` opens the rear camera straight away on a
              phone or tablet — the station's own camera panel is for desktops
              with a webcam pointed at the bench. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) await upload(file);
            }}
          />
          <Button
            variant="outline"
            size="lg"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
          >
            <Camera className="size-4" />
            {t("fulfillment.actions.proof")}
          </Button>

          {/* The bench's one Action Blue. 48px — this is the button a packer
              hits with a parcel in the other hand. */}
          <Button size="lg" onClick={() => setHandoff(true)} disabled={pending}>
            <PackageCheck className="size-4" />
            {t("fulfillment.actions.handoff")}
          </Button>
        </div>
      </div>

      {overwritePrompt}

      {handoff && (
        <HandoffDialog
          group={group}
          onClose={() => setHandoff(false)}
          onShipped={(labelUrl) => {
            setHandoff(false);
            onShipped(labelUrl);
          }}
        />
      )}

      {linking && (
        <LinkLabelDialog
          group={group}
          onClose={() => setLinking(false)}
          onLinked={async () => {
            setLinking(false);
            const fresh = await refreshGroupAction({ orderId: group.orders[0].id });
            if (fresh) onGroup(fresh);
          }}
        />
      )}
    </>
  );
}
