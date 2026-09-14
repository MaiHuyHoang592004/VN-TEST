/** A handler throws this to signal "retry, but wait at least this long" — e.g. Shopify's Retry-After header or a cost-throttle estimate. Omit retryAfterSeconds to fall back to the loop's normal exponential backoff. */
export class RetryableOutboxError extends Error {
  constructor(message: string, public readonly retryAfterSeconds?: number) { super(message); }
}

/** A handler throws this to signal a permanent failure — dead-letter immediately, no retry (e.g. a Shopify mutation's userErrors). */
export class BusinessOutboxError extends Error {}
