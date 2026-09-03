/**
 * The public API's front door. Every /api/v1 handler is wrapped in this, so
 * auth, rate limiting and the error shape are decided ONCE rather than
 * per-endpoint — the legacy API had a different error body on most routes and
 * integrators had to special-case each.
 *
 * Why this matters more than a first endpoint usually does: doc 04 §0c found
 * that the system has no ecommerce integrations at all, and every future one —
 * Shopify, Etsy, the TikTok importer, the VM-4001 cron — should arrive HERE
 * rather than reaching into the database. Anything this wrapper enforces, they
 * all inherit; anything it forgets, they all reimplement differently.
 *
 * The contract, fixed here for every endpoint that follows:
 *   • auth is `x-api-key`, hashed and looked up (never compared in plaintext);
 *   • money is a STRING with 2 decimals — JSON numbers are float64, and
 *     12.10 × 3 is not 36.30 in every language that will parse this;
 *   • timestamps are ISO-8601 UTC with a Z, never a local-time string;
 *   • errors are always { error: { code, message } } with a machine-readable
 *     code, so an integration branches on `code` and never parses English;
 *   • 401 unauthenticated, 403 authenticated-but-not-allowed, 429 rate limited
 *     with Retry-After.
 */
import { RateLimitError, RATE_LIMITS, enforceRateLimit } from "@opcreative/db";
import type { SessionUser } from "@opcreative/auth";
import { verifyApiKey } from "@/modules/identity";
import { ForbiddenError } from "@/modules/core/guard.ts";

export type ApiActor = SessionUser;

/** Stable, machine-readable failure codes. Add to this list; never reword an
 * existing one — an integration may be branching on it. */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "conflict"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 422,
  rate_limited: 429,
  conflict: 409,
  internal: 500,
};

export function apiError(code: ApiErrorCode, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, { status: STATUS[code] });
}

/** Money as a fixed-2 string. Null stays null rather than becoming "0.00" —
 * "not priced yet" and "free" are different facts. */
export const money = (v: { toFixed(n: number): string } | null | undefined): string | null =>
  v == null ? null : v.toFixed(2);

/** ISO-8601 UTC. */
export const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;

type Handler = (req: Request, actor: ApiActor, ctx: { params: Record<string, string> }) => Promise<Response>;

/**
 * Authenticate, rate limit, run, and turn anything that escapes into the
 * standard envelope.
 *
 * Rate limiting is keyed on the API KEY, not the IP: integrations run from
 * shared cloud IPs, so an IP limit would have one warehouse throttle another.
 */
export function withApiKey(handler: Handler) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const presented = req.headers.get("x-api-key");
    if (!presented) {
      return apiError("unauthorized", "Provide your API key in the x-api-key header.");
    }

    const actor = await verifyApiKey(presented);
    // One message for missing, wrong, revoked and expired keys alike: saying
    // which would confirm to a guesser that a key exists.
    if (!actor) return apiError("unauthorized", "That API key is not valid.");

    try {
      await enforceRateLimit(`api:${actor.id}`, RATE_LIMITS.api);
      return await handler(req, actor, { params: await ctx.params });
    } catch (e) {
      if (e instanceof RateLimitError) {
        return Response.json(
          { error: { code: "rate_limited", message: "Too many requests. Retry shortly." } },
          { status: 429, headers: { "Retry-After": String(e.retryAfter ?? 60) } },
        );
      }
      if (e instanceof ForbiddenError) {
        return apiError("forbidden", "Your key's owner may not perform that action.");
      }
      // Zod: report which field, without leaking internals.
      if (e instanceof Error && e.name === "ZodError") {
        const issues = JSON.parse(e.message) as Array<{ path: string[]; message: string }>;
        return apiError("invalid_request", "One or more fields are invalid.", {
          fields: issues.map((i) => ({ field: i.path.join("."), message: i.message })),
        });
      }
      // Prisma's findFirstOrThrow when the scope excluded the column: to this
      // caller the record genuinely does not exist, and 404 (not 403) is also
      // what stops the API confirming that someone else's order id is real.
      if (e instanceof Error && "code" in e && e.code === "P2025") {
        return apiError("not_found", "No such record.");
      }
      console.error("[api/v1]", e);
      return apiError("internal", "Something went wrong on our side.");
    }
  };
}
