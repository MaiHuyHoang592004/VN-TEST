/**
 * The carrier interface. KiloShips is implementation #1, not the shape.
 *
 * Doc 03's R3 discipline, and the same reasoning as storage.ts: a carrier is a
 * vendor, vendors get replaced, and the difference between "swap the provider"
 * and "rewrite label buying" is whether anything outside these types ever
 * learned the vendor's name. Nothing in purchase.ts, the UI or the database
 * mentions KiloShips — the impl is chosen by env, exactly like a storage
 * driver.
 *
 * IDEMPOTENCY IS PART OF THE CONTRACT, not an implementation detail: buying a
 * label spends real money, a retry is normal (a timeout tells you nothing
 * about whether the far end acted), and a provider that cannot return the SAME
 * label for the same reference is a provider that will eventually double-bill
 * a seller.
 */
export type Address = {
  name: string;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  zip: string;
  country: string;
  phone?: string | null;
  email?: string | null;
};

export type Parcel = {
  length: number;
  width: number;
  height: number;
  distanceUnit: "in" | "cm";
  weight: number;
  massUnit: "lb" | "oz" | "kg" | "g";
};

export type LabelGroup = {
  /** Stable per group and reused on retry — the key the provider dedupes on. */
  referenceId: string;
  orders: Array<{ id: number; externalId: string | null; quantity: number }>;
  from: Address;
  to: Address;
  parcels: Parcel[];
  serviceLevel: string;
};

export type PurchasedLabel = {
  labelUrl: string;
  trackingNumber: string;
  provider: string;
  method: string;
  /** A string, like every other money value — a float cannot hold 4.10. */
  cost?: string;
  /** The provider's untouched response, stored on the shipment for disputes. */
  raw: unknown;
};

export type LabelProvider = {
  name: string;
  /** MUST be idempotent on group.referenceId: a retry returns the SAME label,
   * never a second purchase. */
  purchase(group: LabelGroup): Promise<PurchasedLabel>;
};

/** A refusal the UI can render per group, with a code rather than prose. */
export class LabelProviderError extends Error {
  readonly code: "provider-rejected" | "provider-unreachable" | "not-configured";
  readonly detail?: unknown;
  constructor(
    code: "provider-rejected" | "provider-unreachable" | "not-configured",
    message: string,
    detail?: unknown,
  ) {
    super(message);
    this.name = "LabelProviderError";
    this.code = code;
    this.detail = detail;
  }
}
