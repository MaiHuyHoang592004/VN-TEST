"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";

/**
 * Runs a server action and turns its three possible outcomes into UI state:
 * field errors, a form-level error, or success.
 *
 * The three outcomes it has to reconcile:
 *   • zod threw          → per-field messages under the fields
 *   • the service said   → `{ ok:false, error:"code" }`, a domain failure like
 *                          "wrong-password", mapped to a readable sentence
 *   • something crashed  → a form-level message, never a silent no-op
 *
 * Written once because getting this wrong is how forms end up "not doing
 * anything" when they fail — the failure mode users actually report.
 */
export type ActionResult =
  | { ok: boolean; error?: string; fieldErrors?: Record<string, string> }
  | void
  | undefined;

export function useFormAction<TInput>({
  action,
  onSuccess,
  successMessage,
  /** Maps a domain error code to a human sentence. */
  errorMessages = {},
}: {
  action: (input: TInput) => Promise<ActionResult>;
  onSuccess?: () => void;
  successMessage?: string;
  errorMessages?: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useCallback(
    (input: TInput) => {
      setFieldErrors({});
      setFormError(null);
      startTransition(async () => {
        try {
          const result = await action(input);
          if (result && result.ok === false) {
            // Server-side validation arrives as DATA (see withValidation): a
            // ZodError can't survive the wire as a class, so field messages
            // would otherwise be unreachable from the client.
            if (result.fieldErrors) {
              setFieldErrors(result.fieldErrors);
              return;
            }
            const code = result.error ?? "unknown";
            const message = errorMessages[code] ?? code;
            setFormError(message);
            toast.error(message);
            return;
          }
          if (successMessage) toast.success(successMessage);
          onSuccess?.();
        } catch (e) {
          // The server re-validates, so a zod throw here means the client and
          // server schemas disagree — surface it per field rather than as a
          // generic failure.
          if (e instanceof ZodError) {
            const next: Record<string, string> = {};
            for (const issue of e.issues) {
              const key = issue.path.join(".");
              if (key && !next[key]) next[key] = issue.message;
            }
            setFieldErrors(next);
            return;
          }
          const message = e instanceof Error ? e.message : "Something went wrong";
          setFormError(message);
          toast.error(message);
        }
      });
    },
    [action, errorMessages, onSuccess, successMessage],
  );

  return {
    submit,
    pending,
    fieldErrors,
    formError,
    clearErrors: () => {
      setFieldErrors({});
      setFormError(null);
    },
  };
}
