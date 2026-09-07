"use client";

import { MoreHorizontal, RefreshCw, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Can } from "@/components/global/permission-gate";
import { usePermissions } from "@/hooks/use-permissions";
import { useTranslation } from "@/lib/i18n";

import { DownloadLabelsButton } from "./download-labels-button";
import { ExportButton } from "./export-button";

/**
 * The overflow half of the orders toolbar.
 *
 * WHY IT EXISTS. Selecting rows used to render up to ELEVEN buttons into one
 * `flex-wrap`: two or three lines of controls that pushed the table itself off
 * the first screen, on a page whose entire job is the table. The three tiers are
 * now (a) page actions — Import, New order — in the toolbar's `actions` slot,
 * (b) the two or three selection actions an operator reaches for constantly —
 * move status, print the QR sheet, buy labels, assign — in `bulkActions`, and
 * (c) everything else, here.
 *
 * WHY A POPOVER AND NOT A DROPDOWNMENU. Three of these five controls are
 * existing components — `ExportButton`, `DownloadLabelsButton` — that render
 * their own `<Button>` and own their own pending state, spinner and toasts.
 * Base UI's `DropdownMenuItem` composes ONTO the element it renders (`render={
 * <El/>}`), passing it role, tabIndex, `data-highlighted` and its keyboard
 * handlers, so wrapping them as menu items means rewriting them — which this
 * change explicitly must not do. A popover holding the real buttons keeps their
 * behaviour byte-for-byte and still costs one click. The trade is that Tab, not
 * the arrow keys, moves between them.
 *
 * WHY IT IS ALWAYS VISIBLE rather than appearing with a selection: Export and
 * Download labels are NOT selection actions. Export with no selection exports
 * the current filter, and Download labels with none falls back to today's
 * labels — that is the behaviour they shipped with and the way the floor uses
 * them at the end of a shift. Hiding them until something is ticked would have
 * removed a feature in the name of tidying one.
 *
 * The three selection-scoped items simply are not drawn without a selection, so
 * the menu is two items at rest and five with rows ticked. A disabled
 * "Refund" that has nothing to refund teaches nothing.
 */
export function OrderMoreActions({
  selectedIds,
  onRecalc,
  recalcPending,
  onRefund,
  onDelete,
}: {
  selectedIds: number[];
  onRecalc: () => void;
  recalcPending: boolean;
  onRefund: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const hasSelection = selectedIds.length > 0;
  /**
   * The heading and the rule above the destructive group are drawn from the
   * same `can()` the two buttons under them are gated by, rather than from one
   * of the two `<Can>` gates: refund and delete are separate permissions, and
   * hanging the heading off `orders.refund` would have left somebody who may
   * delete but not refund looking at an unlabelled red button in a group with
   * no rule above it.
   */
  const canDestruct = can("orders.refund") || can("orders.delete");

  /**
   * Stacked, left-aligned and rectangular — applied to the CHILDREN because
   * two of them are components whose buttons this file does not construct.
   * Layout only: no colour, no variant, no state. A pill floating in the middle
   * of a vertical list reads as a stray control rather than a menu row.
   */
  const stack =
    "flex flex-col gap-0.5 [&_button]:w-full [&_button]:justify-start " +
    "[&_button]:rounded-(--radius-xs) [&_button]:shadow-none";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" aria-label={t("orders.more")}>
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-60">
        <div className={stack}>
          {/* Both of these read the URL's filter when nothing is selected and
              the selection when there is — their own contract, unchanged. */}
          <ExportButton orderIds={selectedIds} />
          <Can permission="orders.labels.manage">
            <DownloadLabelsButton orderIds={selectedIds} />
          </Can>

          {hasSelection && (
            <Can permission="orders.update">
              <Button variant="ghost" disabled={recalcPending} onClick={onRecalc}>
                <RefreshCw className="size-4" />
                {t("orders.recalc.action")}
              </Button>
            </Can>
          )}
        </div>

        {/*
          THE DESTRUCTIVE GROUP IS SEPARATED, and both halves of "separated"
          are doing work. POSITIONALLY: below a rule and a heading, at the end
          of the list, so the pointer never passes over Delete on its way to
          Export — these two used to sit inline between Recalculate and
          Download labels, one mis-click apart from each other. VISUALLY: the
          `destructive` variant, which is the only place in this menu that
          carries the critical ink.

          Neither one loses its confirmation. Refund opens RefundDialog (which
          quotes the money first) and Delete opens DeleteOrdersDialog; these
          buttons only open them, exactly as before.
        */}
        {hasSelection && canDestruct && (
          <>
            <Separator className="my-2" />
            <p className="px-1.5 pb-1 text-(length:--fs-micro) font-bold tracking-(--ls-caps) uppercase text-(--text-muted)">
              {t("orders.destructive")}
            </p>
            <div className={stack}>
              <Can permission="orders.refund">
                <Button variant="destructive" onClick={onRefund}>
                  <Undo2 className="size-4" />
                  {t("orders.refund")}
                </Button>
              </Can>
              <Can permission="orders.delete">
                <Button variant="destructive" onClick={onDelete}>
                  <Trash2 className="size-4" />
                  {t("orders.delete")}
                </Button>
              </Can>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
