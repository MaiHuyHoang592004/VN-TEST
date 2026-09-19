/**
 * Service errors carry a code, because the layer above has to branch on what
 * went wrong and a string message is not an API. Everything here maps cleanly
 * onto an HTTP status without the route handler knowing any domain detail.
 */

export class ServiceError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

/** Input did not satisfy the domain's rules. → 422 */
export class ValidationError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super("validation_failed", message, details);
  }
}

/** The row does not exist, or does not belong to this tenant — indistinguishable on purpose. → 404 */
export class NotFoundError extends ServiceError {
  constructor(what: string, id?: string) {
    super("not_found", id ? `${what} "${id}" not found` : `${what} not found`);
  }
}

/** The actor is authenticated but not permitted. → 403 */
export class ForbiddenError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super("forbidden", message, details);
  }
}

/**
 * The write lost a race, or duplicates something unique. → 409
 *
 * Distinct from ValidationError because the caller's correct response is
 * different: reload and retry, rather than fix the input.
 */
export class ConflictError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super("conflict", message, details);
  }
}

/** Prisma's unique-constraint code. Checked rather than parsed from a message. */
export const PRISMA_UNIQUE_VIOLATION = "P2002";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
  );
}
