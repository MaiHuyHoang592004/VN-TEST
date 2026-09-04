/**
 * KiloShips — the first LabelProvider. Port of legacy prod's
 * kiloships-label.service.ts.
 *
 * The part worth reading twice is the idempotency recovery. A label purchase
 * is a payment: if our request times out or the connection drops, we do NOT
 * know whether the far end bought a label, and retrying blindly buys a second
 * one that nobody will ever print. So every group carries a uniqueReferenceId,
 * and when the provider rejects a duplicate we go and FETCH the label that
 * reference already bought. A retry therefore always ends with the same label,
 * whatever happened the first time.
 */
import {
  LabelProviderError,
  type LabelGroup,
  type LabelProvider,
  type PurchasedLabel,
} from "./provider.ts";

const DEFAULT_BASE_URL = "https://kiloships.com/api";
const DEFAULT_SERVICE_LEVEL = "usps_ground_advantage";
const TIMEOUT_MS = 30_000;

type KiloShipsLabel = {
  label_url?: string;
  labelUrl?: string;
  tracking_number?: string;
  trackingNumber?: string;
  servicelevel_token?: string;
  rate?: { amount?: string | number; servicelevel_token?: string };
  amount?: string | number;
};

const baseUrl = () => (process.env.KILOSHIPS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

/** Money as a fixed-2 STRING, never a float. */
const money = (v: string | number | undefined): string | undefined =>
  v === undefined || v === null || v === "" ? undefined : Number(v).toFixed(2);

function toPurchased(raw: KiloShipsLabel): PurchasedLabel {
  const labelUrl = raw.label_url ?? raw.labelUrl;
  const trackingNumber = raw.tracking_number ?? raw.trackingNumber;
  if (!labelUrl || !trackingNumber) {
    // A 200 with no label is still a failure — treating it as success is how a
    // parcel ends up marked shipped with nothing to stick on the box.
    throw new LabelProviderError(
      "provider-rejected",
      "KiloShips returned no label url or tracking number",
      raw,
    );
  }
  return {
    labelUrl,
    trackingNumber,
    provider: "kiloships",
    method: raw.servicelevel_token ?? raw.rate?.servicelevel_token ?? DEFAULT_SERVICE_LEVEL,
    cost: money(raw.amount ?? raw.rate?.amount),
    raw,
  };
}

async function call(path: string, init: RequestInit): Promise<unknown> {
  const key = process.env.KILOSHIPS_API_KEY;
  if (!key) throw new LabelProviderError("not-configured", "KILOSHIPS_API_KEY is not set");

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Unreachable is DIFFERENT from rejected: we do not know whether the far
    // end acted, which is exactly when the reference-id recovery matters.
    throw new LabelProviderError(
      "provider-unreachable",
      e instanceof Error ? e.message : "KiloShips did not respond",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (body as { message?: string; error?: string } | null)?.message ??
      (body as { error?: string } | null)?.error ??
      `HTTP ${response.status}`;
    throw new LabelProviderError("provider-rejected", message, body);
  }
  return body;
}

/** Their duplicate-reference rejection, however it happens to be worded. */
const isDuplicateReference = (e: unknown): boolean =>
  e instanceof LabelProviderError &&
  e.code === "provider-rejected" &&
  /duplicate|already exists|reference/i.test(e.message);

export const kiloShips: LabelProvider = {
  name: "kiloships",

  async purchase(group: LabelGroup): Promise<PurchasedLabel> {
    const payload = {
      uniqueReferenceId: group.referenceId,
      servicelevelToken: group.serviceLevel || DEFAULT_SERVICE_LEVEL,
      addressFrom: group.from,
      addressTo: group.to,
      parcels: group.parcels,
      metadata: group.orders.map((o) => o.externalId ?? String(o.id)).join(","),
    };

    try {
      const body = await call("/shipping-labels/domestic", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return toPurchased((body as { data?: KiloShipsLabel })?.data ?? (body as KiloShipsLabel));
    } catch (e) {
      // THE RETRY PATH. This reference already bought a label; fetch it rather
      // than buying another. Same money, same label, however many times the
      // request is repeated.
      if (isDuplicateReference(e)) return this.recover(group.referenceId);
      throw e;
    }
  },

  /** Fetch the label a reference already bought. Exported through the provider
   * object so purchase() can call it, and so a support script can too. */
  async recover(referenceId: string): Promise<PurchasedLabel> {
    const body = await call(`/shipping-labels/reference/${encodeURIComponent(referenceId)}`, {
      method: "GET",
    });
    return toPurchased((body as { data?: KiloShipsLabel })?.data ?? (body as KiloShipsLabel));
  },

  // ponytail: `void` is deliberately NOT implemented here. Same status as
  // doc 05's own note on purchase() before it shipped — "the carrier has
  // never been called" — except this endpoint has never even been SEEN: the
  // legacy port (prod:1049-1103) covers purchase and the reference-recovery
  // GET, nothing that cancels one. Guessing a REST shape (DELETE? a /void
  // POST?) and shipping it unverified against a real payment-adjacent
  // endpoint is worse than not having it — a wrong call could be silently
  // ignored by KiloShips, or worse, do something unintended. voidLabel()
  // (labels/void.ts) already works correctly without this: it records the
  // void LOCALLY (voidedAt/voidReason) so the system stops claiming a live
  // label, and leaves carrierVoided:false so nobody mistakes that for a
  // confirmed carrier-side cancellation. Ceiling: an operator still has to
  // cancel with KiloShips support directly until this is confirmed and
  // added. Upgrade path: implement `void` here once real API docs (or a
  // support contact who can confirm the endpoint) exist — the interface in
  // provider.ts is already shaped for it.
} as LabelProvider & { recover(referenceId: string): Promise<PurchasedLabel> };
