/**
 * Thin Shopify Admin GraphQL client shared by apps/api and apps/worker (M5).
 * Classifies only transport/protocol-level failures so callers know whether
 * to retry: network errors, HTTP 429/5xx (honoring a `Retry-After` header
 * when Shopify sends one), and GraphQL-level cost throttling (`errors[].
 * extensions.code === "THROTTLED"` — the Admin API's leaky-bucket limiter
 * has no `Retry-After` header, so the wait is derived from
 * `extensions.cost.throttleStatus` instead, falling back to Shopify's
 * documented one-second minimum backoff when cost data is absent).
 * A mutation's own `userErrors` are a business-level concern for the caller
 * to inspect in `data`, not something this client interprets.
 */
export type ShopifyGraphqlThrottleStatus = { maximumAvailable: number; currentlyAvailable: number; restoreRate: number };
export type ShopifyGraphqlCost = { requestedQueryCost: number; actualQueryCost?: number; throttleStatus?: ShopifyGraphqlThrottleStatus };
type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
  extensions?: { cost?: ShopifyGraphqlCost };
};

const DEFAULT_API_VERSION = "2026-07";
const MIN_THROTTLE_BACKOFF_SECONDS = 1;

/** Thrown for anything the caller should retry later (never for GraphQL `userErrors`, which are the caller's own business decision). */
export class ShopifyRetryableError extends Error {
  readonly retryAfterSeconds?: number;
  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function throttleRetryAfterSeconds(cost: ShopifyGraphqlCost | undefined): number {
  if (!cost?.throttleStatus) return MIN_THROTTLE_BACKOFF_SECONDS;
  const shortfall = cost.requestedQueryCost - cost.throttleStatus.currentlyAvailable;
  if (shortfall <= 0) return MIN_THROTTLE_BACKOFF_SECONDS;
  return Math.max(MIN_THROTTLE_BACKOFF_SECONDS, Math.ceil(shortfall / Math.max(cost.throttleStatus.restoreRate, 1)));
}

export async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
  apiVersion: string = DEFAULT_API_VERSION,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw new ShopifyRetryableError(`network error calling Shopify GraphQL: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.status === 429 || res.status >= 500) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    throw new ShopifyRetryableError(`shopify graphql endpoint returned ${res.status}`, retryAfterSeconds);
  }
  if (!res.ok) throw new Error(`shopify graphql endpoint failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as GraphqlResponse<T>;
  if (body.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
    throw new ShopifyRetryableError("shopify graphql query cost throttled", throttleRetryAfterSeconds(body.extensions?.cost));
  }
  if (body.errors?.length) throw new Error(`shopify graphql errors: ${body.errors.map((e) => e.message).join("; ")}`);
  if (body.data === undefined) throw new Error("shopify graphql response had no data");
  return body.data;
}
