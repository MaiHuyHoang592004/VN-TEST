/**
 * Outbound seller webhooks — how an integration hears that something moved
 * without polling us.
 *
 * Three things changed from legacy, all deliberate:
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
 *  3. A FAILED SELLER ENDPOINT NO LONGER LOSES THE EVENT FOR GOOD. Up to
 *     RETRY_DELAYS_MS.length + 1 attempts with a short backoff, and every
 *     outcome — success or exhausted retries — is written to WebhookDelivery
 *     so an outage is something a seller (or support) can SEE after the fact,
 *     not a silent console.warn nobody was watching. This is still not a
 *     queue: the retries happen inline, in the same request that triggered
 *     the event, so a seller endpoint that is merely slow (not down) still
 *     adds up to ~(10s × attempts) to whatever caller dispatched it — bounded
 *     because dispatch always runs after commit, never inside one. Ceiling: a
 *     seller down for longer than these retries span still loses the event,
 *     just visibly (WebhookDelivery.status = FAILED) instead of silently.
 *     Upgrade path: a real queue with a background re-driver, at which point
 *     this function becomes the enqueue and nothing calling it changes.
 */
import { createHmac } from "node:crypto";

import { prisma } from "@gwprint/db";

export type WebhookEvent =
  | "order_created"
  | "order_status"
  | "order_refunded"
  | "shipping_added"
  | "tracking_status";

const TIMEOUT_MS = 10_000;
/** Delays BETWEEN attempts. 3 attempts total: immediate, +300ms, +900ms. */
const RETRY_DELAYS_MS = [300, 900];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The ONE signing scheme, so a hand test (profile's "Test webhook" button)
 * and a real delivery can never drift apart — a seller who verifies against
 * whatever this function does will always verify a real event correctly.
 * HMAC-SHA256 over the raw body, hex-encoded.
 */
export const signWebhookBody = (secret: string, body: string): string =>
  createHmac("sha256", secret).update(body).digest("hex");

async function attemptOnce(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return { ok: true };
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (e) {
    // Includes DNS failures, TLS errors and the 10s timeout.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Deliver one event to one seller. Resolves even when every attempt fails —
 * callers are business operations that have already committed, and a
 * seller's outage is not a reason to fail a customer worker's scan.
 */
export async function dispatchWebhook(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
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
    "User-Agent": "GWPrint-Webhook/1.0",
  };
  if (seller.webhookSecret) {
    headers["X-Signature"] = signWebhookBody(seller.webhookSecret, body);
  }

  let attempts = 0;
  let lastError: string | undefined;
  for (let i = 0; ; i++) {
    attempts++;
    const result = await attemptOnce(seller.webhookUrl, headers, body);
    if (result.ok) {
      lastError = undefined;
      break;
    }
    lastError = result.error;
    console.warn(`[webhook] ${event} → ${userId} attempt ${attempts} failed:`, lastError);
    if (i >= RETRY_DELAYS_MS.length) break;
    await sleep(RETRY_DELAYS_MS[i]);
  }

  try {
    await prisma.webhookDelivery.create({
      data: {
        userId,
        event,
        payload: data as never,
        status: lastError ? "FAILED" : "DELIVERED",
        attempts,
        lastError: lastError ?? null,
      },
    });
  } catch (e) {
    // The delivery log is diagnostic, not authoritative — losing a LOG row
    // must never make the caller think the whole dispatch failed.
    console.warn(`[webhook] failed to write delivery log for ${event} → ${userId}:`, e);
  }
}

/**
 * One event, many sellers. Concurrent because a batch handoff can span a dozen
 * shops and they are independent — one slow endpoint should not add its
 * retries to everyone else's.
 */
export async function dispatchWebhookMany(
  userIds: string[],
  event: WebhookEvent,
  data: (userId: string) => Record<string, unknown>,
): Promise<void> {
  await Promise.all([...new Set(userIds)].map((id) => dispatchWebhook(id, event, data(id))));
}
