/**
 * Outbound seller webhooks — how an integration hears that something moved
 * without polling us.
 *
 * Two things changed from legacy, both deliberate:
 *
 *  1. WE SIGN, WE DO NOT SEND THE SECRET. Legacy put the seller's secret in an
 *     `x-api-key` header on every call, so the shared secret travelled the wire
 *     on each delivery and any proxy, log or misrouted request leaked it — and
 *     a receiver still could not tell a forged body from a real one. Here the
 *     secret never leaves the database: it signs the RAW BODY with HMAC-SHA256
 *     and the digest goes in `X-Signature`. A receiver recomputes it and knows
 *     both who sent it and that nothing was altered on the way.
 *  2. IT IS CALLED AFTER COMMIT, NEVER INSIDE $transaction. An outbound HTTP
 *     call has a 10s timeout; a transaction that awaits one holds its column locks
 *     for those 10 seconds, so one slow seller endpoint would stall the scan
 *     station for everyone.
 *
 * // ponytail: fire-and-forget — no retry, no delivery log (doc 03's deferral
 * // stands). Ceiling: a seller whose endpoint is down loses those events for
 * // good. Upgrade path: a queue plus a deliveries table, at which point this
 * // function becomes the enqueue and nothing calling it changes.
 */
import { createHmac } from "node:crypto";

import { prisma } from "@opcreative/db";

export type WebhookEvent = "order_status" | "shipping_added" | "tracking_status";

const TIMEOUT_MS = 10_000;

/**
 * Deliver one event to one seller. Resolves even when delivery fails —
 * callers are business operations that have already committed, and a seller's
 * outage is not a reason to fail a customer worker's scan.
 */
export async function dispatchWebhook(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const seller = await prisma.user.findUnique({
      where: { id: userId },
      select: { webhookUrl: true, webhookSecret: true },
    });
    if (!seller?.webhookUrl) return;

    // Signed over the EXACT bytes sent. Serialise once and post that string —
    // re-stringifying for the signature is how a signature ends up computed
    // over a different key order than the body carries.
    const body = JSON.stringify({ type: event, data });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "OPCreative-Webhook/1.0",
    };
    if (seller.webhookSecret) {
      headers["X-Signature"] = createHmac("sha256", seller.webhookSecret).update(body).digest("hex");
    }

    const response = await fetch(seller.webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[webhook] ${event} → ${userId}: HTTP ${response.status}`);
    }
  } catch (e) {
    // Includes DNS failures, TLS errors and the 10s timeout. Warn, never throw.
    console.warn(`[webhook] ${event} → ${userId} failed:`, e instanceof Error ? e.message : e);
  }
}

/**
 * One event, many sellers. Concurrent because a batch handoff can span a dozen
 * shops and they are independent — one slow endpoint should not add its 10s to
 * everyone else's.
 */
export async function dispatchWebhookMany(
  userIds: string[],
  event: WebhookEvent,
  data: (userId: string) => Record<string, unknown>,
): Promise<void> {
  await Promise.all([...new Set(userIds)].map((id) => dispatchWebhook(id, event, data(id))));
}
