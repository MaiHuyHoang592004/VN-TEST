"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * The shell every create/edit dialog reuses: title, description, body, and a
 * footer whose submit button reflects pending state.
 *
 * RESPONSIVE BY DEFAULT. On a phone this is a bottom sheet that slides up and
 * can be swiped down; on desktop it's a centred dialog. A centred modal on a
 * small screen puts the submit button under the keyboard and the close target
 * out of thumb reach — the sheet is the native-feeling shape, and doing the
 * switch HERE means every modal in the app gets it without remembering to.
 *
 * Submits via a real <form onSubmit> in both shapes, so Enter works — a dialog
 * whose only submit path is clicking a button is a keyboard trap for anyone
 * filling it in quickly.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending = false,
  submitDisabled = false,
  destructive = false,
  formError,
  onSubmit,
  children,
  footerHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  pending?: boolean;
  submitDisabled?: boolean;
  destructive?: boolean;
  /** Form-level failure from useFormAction. */
  formError?: string | null;
  onSubmit: () => void;
  children: ReactNode;
  footerHint?: ReactNode;
}) {
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const body = (
    <>
      {children}
      {formError && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      )}
    </>
  );

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => onOpenChange(false)}
        disabled={pending}
      >
        {t("common.cancel")}
      </Button>
      <Button
        type="submit"
        variant={destructive ? "destructive" : "default"}
        disabled={pending || submitDisabled}
      >
        {/* Three strings that used to be hardcoded English and therefore
            reached every dialog in the app untranslated, in all seven locales.
            `submitLabel` stays a prop because a dialog that CREATES something
            should not say "Save Changes" — it just no longer defaults to an
            English literal. */}
        {pending ? t("common.saving") : (submitLabel ?? t("common.save"))}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            // Cap the height so a long form scrolls inside the sheet instead of
            // pushing its own submit button off-screen.
            className="flex max-h-[85svh] flex-col"
          >
            <DrawerHeader className="text-left">
              <DrawerTitle>{title}</DrawerTitle>
              {description && <DrawerDescription>{description}</DrawerDescription>}
            </DrawerHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
              {body}
            </div>

            <DrawerFooter className="gap-2">
              {footerHint && (
                <span className="text-muted-foreground text-xs">{footerHint}</span>
              )}
              {/* Reversed on mobile: the primary action sits closest to the
                  thumb, at the bottom. */}
              <div className="flex flex-col-reverse gap-2">{actions}</div>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The popup itself must not scroll: the form below caps its own height
          and scrolls only its fields, which keeps the footer pinned. If the
          popup scrolled too, the submit button would sit at the bottom of a
          scroll nobody knows to make. */}
      <DialogContent className="overflow-y-hidden sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          // Same shape as the drawer: header and footer fixed, fields
          // scrolling between them. Without the cap a tall form (new-order is
          // ~14 fields) overflows a short viewport from the centred position
          // and pushes its own submit button clean off the bottom of the
          // screen — measured at 765px of dialog in a 651px viewport, with the
          // Save button starting exactly at the fold. It cannot be clicked and
          // there is nothing to scroll, because the page behind is locked.
          // 2rem is the popup's own p-4, top plus bottom.
          className="flex max-h-[calc(85svh-2rem)] flex-col"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          {/* -mx-1/px-1 buys the scroll container 4px so it clips focus rings
              off the edge-most fields instead of shaving them. */}
          <div className="-mx-1 flex flex-1 flex-col gap-4 overflow-y-auto px-1 py-4">
            {body}
          </div>

          <DialogFooter className="sm:justify-between">
            <span className="text-muted-foreground self-center text-xs">
              {footerHint}
            </span>
            <div className="flex gap-2">{actions}</div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
