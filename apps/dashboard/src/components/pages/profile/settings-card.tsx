/**
 * The settings card every profile section is built from: title, description,
 * body, and a muted footer holding the hint and the action.
 *
 * Built on the house <Card>, which carries the Vercel chrome: a 1px hairline
 * ring on `--border`, and a fill identical to the page. Geist has no lifted-card
 * step — the ring is the ONLY thing separating a card from the page, which is
 * why it points at the shared border token rather than a hand-picked alpha.
 *
 * Defined once so five tabs can't drift into five slightly different cards —
 * the same reason the server has one guard.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SettingsCard({
  title,
  description,
  footer,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Muted hint on the left of the footer. */
  footer?: ReactNode;
  /** Usually the submit button; sits right in the footer. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    // py-0 removes the house vertical padding so each region owns its own —
    // which means whichever region is LAST must close the card with pb-6, or
    // text sits flush against the bottom edge.
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className={cn("px-6 pt-6", !children && "pb-6")}>
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
        {description && (
          <CardDescription className="mt-1.5 text-sm">
            {description}
          </CardDescription>
        )}
      </CardHeader>

      {children && (
        <CardContent className="px-6 pt-5 pb-6">{children}</CardContent>
      )}

      {(footer || action) && (
        // Vercel's settings pattern: the card body sits on canvas (white) and
        // the action bar is a canvas-soft strip divided by a hairline of the
        // same weight as the card's ring, so the two read as one system.
        <CardFooter className="border-border bg-muted/50 flex flex-col gap-3 rounded-b-xl border-t px-6 py-3 sm:flex-column sm:items-center sm:justify-between">
          <div className="text-muted-foreground text-sm">{footer}</div>
          {action && <div className="flex shrink-0 gap-2">{action}</div>}
        </CardFooter>
      )}
    </Card>
  );
}

/** Consistent page rhythm inside a tab. */
export function SettingsStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}
