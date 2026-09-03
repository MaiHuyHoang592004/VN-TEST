import "server-only";

import { ZodError } from "zod";

/**
 * Turn a thrown ZodError into DATA the client can render.
 *
 * A validation failure inside a Server Action otherwise propagates as an
 * unhandled error: the server logs a stack trace, the request 500s, and the
 * browser gets an opaque digest with no idea which field was wrong. Worse, the
 * client can't `instanceof ZodError` it — the class doesn't survive the wire —
 * so field-level messages were unreachable by construction.
 *
 * Wrapping the action body means "name is required" arrives as a field error
 * next to the field, and a 500 is reserved for things that genuinely are one.
 */
export type FieldErrors = Record<string, string>;

export async function withValidation<T>(
  fn: () => Promise<T>,
): Promise<T | { ok: false; error: "validation"; fieldErrors: FieldErrors }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors: FieldErrors = {};
      for (const issue of e.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: "validation", fieldErrors };
    }
    throw e;
  }
}
