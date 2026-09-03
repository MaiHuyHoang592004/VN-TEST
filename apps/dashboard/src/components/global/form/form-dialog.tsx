"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
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
  submitLabel = "Save",
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
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={pending}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        variant={destructive ? "destructive" : "default"}
        disabled={pending || submitDisabled}
      >
        {pending ? "Working…" : submitLabel}
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
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">{body}</div>

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
