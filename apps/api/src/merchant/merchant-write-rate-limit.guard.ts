import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { RequestWithTenant } from "../shopify/tenant.guard.js";

/**
 * Conservative in-memory fixed-window limiter for merchant WRITE endpoints
 * (`docs/security/data-handling.md`'s checklist). No new dependency (V1's
 * own "stay deployable off Vercel, no exotic platform services" ethos —
 * ADR-06) and no cross-replica coordination: acceptable because V1's own
 * deployment target (plan Task 28) is one worker/API replica. Keyed by
 * tenant, not IP, so one merchant's burst never throttles another's — must
 * run after ShopifyTenantGuard in the guard list so `req.tenant` is set.
 */
const WINDOW_MS = 60_000;
const MAX_WRITES_PER_WINDOW = 30;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

@Injectable()
export class MerchantWriteRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithTenant>();
    const key = req.tenant?.organizationId ?? req.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (bucket.count >= MAX_WRITES_PER_WINDOW) {
      throw new HttpException("Too many requests — try again shortly.", HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.count++;
    return true;
  }
}
