/**
 * Carrier tracking (DRX) — the one thing that flows INTO this system.
 *
 * Two rules, both learned from the legacy implementation:
 *
 *  1. AN UNSIGNED PAYLOAD IS REJECTED, ALWAYS. Legacy skipped signature
 *     verification whenever the secret happened to be unconfigured, which
 *     means its "verified" webhook was an unauthenticated write endpoint on
 *     any deploy where someone forgot an env var. Here a missing secret means
 *     the route refuses everything: it is better to receive no tracking
 *     updates than to accept them from anyone.
 *  2. TRACKING IS ITS OWN AXIS. `Shipment.trackingStatus` is a raw carrier
 *     string and never an enum, and it does NOT move the order's status. A
 *     carrier saying "delivered" is evidence, not a state transition — see O1
 *     in doc 05 for the open question about whether it should become one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@gwprint/db";

import { dispatchWebhook, notify } from "../../platform/index.ts";

const API_BASE = process.env.DRX_API_BASE_URL || "https://api.drxtracking.com";
const TIMEOUT_MS = 10_000;

export const trackingEnabled = (): boolean => Boolean(process.env.DRX_API_KEY);

/**
 * Ask DRX to watch these numbers. Fire-and-forget: a label is bought and a
 * parcel ships whether or not the tracking subscription succeeded, so this
 * never throws into a purchase.
 */
export async function subscribeTracking(trackingNumbers: string[]): Promise<void> {
  const key = process.env.DRX_API_KEY;
  if (!key || !trackingNumbers.length) return;
  try {
    const response = await fetch(`${API_BASE}/v2/track/register-tracking`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify({ trackingNumbers }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[tracking] register failed: HTTP ${response.status}`);
    }
  } catch (e) {
    console.warn("[tracking] register failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Verify a webhook body. Compares in constant time, and refuses outright when
 * no secret is configured — see rule 1 above.
 */
export function verifyTrackingSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.DRX_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // expected length through an exception path.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Carrier outcomes worth a seller's attention. Every other scan along the
 * route updates the column silently — a bell for "departed facility" is how a
 * notification panel becomes something people stop reading.
 */
const NOTIFIABLE = /^(delivered|exception|returned|failure|undeliverable|damaged)/i;

export type TrackingPayload = {
  trackingNumber?: string;
  tracking_number?: string;
  status?: string;
  tracking_status?: string;
  detail?: string;
};

/**
 * Apply one carrier update to every shipment carrying that tracking number.
 *
 * Idempotent by construction: an unchanged status writes nothing and notifies
 * nobody, so a carrier that re-delivers the same webhook three times (they do)
 * produces one bell, not three.
 */
export async function applyTrackingUpdate(
  payload: TrackingPayload,
): Promise<{ updated: number; notified: number }> {
  const trackingNumber = (payload.trackingNumber ?? payload.tracking_number ?? "").trim();
  const status = (payload.status ?? payload.tracking_status ?? "").trim();
  if (!trackingNumber || !status) return { updated: 0, notified: 0 };

  const shipments = await prisma.shipment.findMany({
    where: { trackingNumber },
    select: {
      id: true,
      trackingStatus: true,
      order: { select: { id: true, externalId: true, customerId: true } },
    },
  });
  if (!shipments.length) return { updated: 0, notified: 0 };

  // The LAST SCAN reflects this event on every matching shipment regardless
  // of whether the derived `status` below actually moved — a carrier
  // resending the same status ("in transit" scanned at another facility) is
  // still a real scan a support ticket should be able to show.
  await prisma.shipment.updateMany({
    where: { id: { in: shipments.map((s) => s.id) } },
    data: { lastScanStatus: status, lastScanDetail: payload.detail ?? null, lastScanAt: new Date() },
  });

  const changed = shipments.filter((s) => s.trackingStatus !== status);
  if (!changed.length) return { updated: 0, notified: 0 };

  await prisma.shipment.updateMany({
    where: { id: { in: changed.map((s) => s.id) } },
    data: { trackingStatus: status },
  });

  let notified = 0;
  if (NOTIFIABLE.test(status)) {
    const sellers = new Map<string, { externalId: string | null; orderId: number }>();
    for (const s of changed) {
      if (s.order?.customerId && !sellers.has(s.order.customerId)) {
        sellers.set(s.order.customerId, {
          externalId: s.order.externalId,
          orderId: s.order.id,
        });
      }
    }
    for (const [userId, order] of sellers) {
      await notify(prisma, {
        userId,
        type: "TRACKING_UPDATED",
        data: {
          externalId: order.externalId ?? String(order.orderId),
          status,
          tracking: trackingNumber,
        },
        href: "/orders",
      });
      notified++;
    }
  }

  // The seller's own integration hears about EVERY change, notifiable or not:
  // a machine reading a feed wants the whole route, and only humans need the
  // restraint.
  const distinctSellers = [
    ...new Set(changed.map((s) => s.order?.customerId).filter((id): id is string => Boolean(id))),
  ];
  for (const userId of distinctSellers) {
    await dispatchWebhook(userId, "tracking_status", {
      tracking_number: trackingNumber,
      status,
      detail: payload.detail ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  return { updated: changed.length, notified };
}
