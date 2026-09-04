/**
 * The settings card every profile section is built from: title, description,
 * body, and a quiet footer holding the hint and the action.
 *
 * Built from the DS layer rather than re-implementing a panel: `Surface` is the
 * white data rung of the SKY → SHELL → WHITE ladder, and `SectionHeading` is the
 * app's one heading treatment, so a section title here is the same display type
 * as one anywhere else. The footer strip sits on the inset rung, divided by a
 * hairline, so the two read as one surface rather than two boxes.
 *
 * Defined once so five tabs can't drift into five slightly different cards —
 * the same reason the server has one guard. Its props are unchanged.
 */
import type { ReactNode } from "react";

import { SectionHeading, Surface } from "@/components/ds";
import { cn } from "@/lib/utils";

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
    // pad={false} because the footer strip must reach the card's edges; each
    // region owns its own padding instead.
    <Surface
      pad={false}
      radius="card"
      shadow="xs"
      className={cn("overflow-hidden", className)}
    >
      <div className="px-6 pt-6 pb-6">
        <SectionHeading title={title} subtitle={description} />
        {children && <div className="mt-5">{children}</div>}
      </div>

      {(footer || action) && (
        <div className="flex flex-col gap-3 border-t border-(--border-hairline) bg-(--surface-inset) px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-(length:--fs-body-sm) text-(--text-muted)">{footer}</div>
          {action && <div className="flex shrink-0 gap-2">{action}</div>}
        </div>
      )}
    </Surface>
  );
}

/** Consistent page rhythm inside a tab. */
export function SettingsStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}
