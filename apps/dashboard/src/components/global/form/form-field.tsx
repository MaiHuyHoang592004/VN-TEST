"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Label + control + hint + error, wired together properly.
 *
 * The point is the accessibility plumbing, which is easy to forget per-field
 * and invisible when missing: the label targets the control, the hint and error
 * are announced via aria-describedby, and an errored control is marked
 * aria-invalid. Doing this once means twenty forms get it right.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  /** Receives the ids to wire onto the control. */
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label
        htmlFor={id}
        className="font-sans text-(length:--fs-body-sm) font-semibold text-(--text-body)"
      >
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden>
            *
          </span>
        )}
      </Label>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}

      {hint && !error && (
        <p id={hintId} className="text-xs text-(--text-muted)">
          {hint}
        </p>
      )}
      {/* role=alert so a screen reader announces a validation failure the user
          didn't scroll to. */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="font-sans text-(length:--fs-meta) text-(--status-critical-fg)"
        >
          {error}
        </p>
      )}
    </div>
  );
}
