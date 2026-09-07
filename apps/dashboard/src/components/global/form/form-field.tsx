"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n";
import { ruleHint, validateValue, type FieldRule } from "./field-rules.ts";

/** Reads the value off whatever element fired, or nothing if it has none —
 * Base UI's Select and Checkbox are not form elements and carry no `.value`. */
function valueOf(target: EventTarget & Element): string | undefined {
  const value = (target as Partial<HTMLInputElement>).value;
  return typeof value === "string" ? value : undefined;
}

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
  rules,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /**
   * The field's own entry from `fieldRules(schema)`. Supplying it adds the
   * rule sentence to the hint and checks the value when the user leaves the
   * field, so a mistake surfaces there instead of after a round trip.
   */
  rules?: FieldRule;
  className?: string;
  /** Receives the ids to wire onto the control. */
  children: (props: {
    id: string;
    /**
     * The id of the rendered <Label>. Use it with `aria-labelledby` when the
     * field is not ONE labelable control — a checkbox list, a radio group, a
     * composed picker. `htmlFor` can only point at a single form element, so
     * without this a group field ends up with a label that references nothing,
     * which is worse than no label: the browser reports a name and the name is
     * empty. Pair it with role="group".
     */
    labelId: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    /** True when the caller marked the field required — so the control can
     * carry aria-required rather than the asterisk being decoration only. */
    "aria-required"?: boolean;
    /** Present only when `rules` was supplied. Spread with the rest. */
    onBlur?: (event: React.FocusEvent<HTMLElement>) => void;
    /**
     * Capture phase on purpose. Call sites spread this bag and then write
     * their own `onChange` immediately after, which would silently replace an
     * injected `onChange` — and the "has the user touched this?" flag would
     * never flip. A differently named prop cannot be shadowed that way, so
     * adding validation costs the call site nothing but the `rules` prop.
     */
    onChangeCapture?: (event: React.FormEvent<HTMLElement>) => void;
  }) => ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // Silent until the user has actually typed something. Flagging an untouched
  // empty field the moment focus passes through would scold people for fields
  // they had not reached yet.
  const [touched, setTouched] = useState(false);
  const [blurError, setBlurError] = useState<string | undefined>(undefined);

  // The server has seen the whole form; a stale local guess must not hide it.
  const shownError = error ?? blurError;
  const isRequired = required || rules?.required === true;

  // Bespoke copy first — it says what the field is FOR; the derived sentence
  // only says what shape the value takes.
  const hintParts = [hint, ruleHint(rules, t)].filter(Boolean);

  const describedBy =
    [shownError ? errorId : null, hintParts.length > 0 ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label
        id={labelId}
        htmlFor={id}
        className="font-sans text-(length:--fs-body-sm) font-semibold text-(--text-body)"
      >
        {label}
        {isRequired && (
          // data-required is what FormDialog's legend keys off: a form with no
          // required field must not carry a legend explaining an asterisk that
          // never appears in it.
          <span data-required className="text-destructive ml-0.5" aria-hidden>
            *
          </span>
        )}
      </Label>

      {children({
        id,
        labelId,
        "aria-describedby": describedBy,
        // The asterisk beside the label is aria-hidden, so without this the
        // required-ness never reached assistive tech at all — it was styling.
        "aria-required": isRequired ? true : undefined,
        "aria-invalid": shownError ? true : undefined,
        ...(rules
          ? {
              onChangeCapture: () => {
                setTouched(true);
                // Stop complaining the moment they start fixing it. The next
                // blur will decide again.
                setBlurError(undefined);
              },
              onBlur: (event: React.FocusEvent<HTMLElement>) => {
                if (!touched) return;
                const value = valueOf(event.currentTarget);
                if (value === undefined) return;
                setBlurError(validateValue(rules, value, t));
              },
            }
          : {}),
      })}

      {/* Kept on screen while the field is in error, not swapped out for it.
          The error says the format is wrong; the hint is the worked example
          that says what right looks like, and hiding it exactly when someone
          needs it is backwards. */}
      {hintParts.length > 0 && (
        <p id={hintId} className="text-xs text-(--text-muted)">
          {hintParts.map((part, index) => (
            <span key={index}>
              {index > 0 && " · "}
              {part}
            </span>
          ))}
        </p>
      )}
      {/* role=alert so a screen reader announces a validation failure the user
          didn't scroll to. */}
      {shownError && (
        <p
          id={errorId}
          role="alert"
          className="font-sans text-(length:--fs-meta) text-(--status-critical-fg)"
        >
          {shownError}
        </p>
      )}
    </div>
  );
}
