/**
 * GET  /api/v1/orders   list the key owner's orders (cursor paginated)
 * POST /api/v1/orders   create one
 *
 * Thin on purpose. Every rule — who may see which rows, that the SKU decides
 * the variant and the price, that a seller creates only for themselves — lives
 * in the service and is therefore identical here and in the web UI. When this
 * file starts growing logic, the service is missing something.
 */
import { can } from "@gwprint/shared";
import { createOrder, listOrdersCursor } from "@/modules/fulfillment/orders/service.ts";
import { withApiKey, apiError } from "../_lib/with-api-key.ts";
import { orderToApi } from "../_lib/serialize.ts";
import type { FulfillmentStatus } from "@gwprint/db";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (req, actor) => {
  const url = new URL(req.url);
  const cursor = Number(url.searchParams.get("cursor")) || undefined;
  const limit = Number(url.searchParams.get("limit")) || undefined;
  const status = url.searchParams.get("status")?.split(",").filter(Boolean) as
    | FulfillmentStatus[]
    | undefined;

  const { rows, nextCursor } = await listOrdersCursor(actor, { cursor, limit, status });
  return Response.json({ data: rows.map(orderToApi), next_cursor: nextCursor });
});

export const POST = withApiKey(async (req, actor) => {
  if (!can(actor.roles, "orders.create")) {
    return apiError("forbidden", "This key's owner may not create orders.");
  }

  // Idempotency-Key is the HTTP convention, so integrations already send it.
  // Without one a dropped response means the client cannot safely retry —
  // exactly how duplicate orders get created — so it is required, not optional.
  const key = req.headers.get("idempotency-key");
  if (!key) {
    return apiError("invalid_request", "An Idempotency-Key header is required to create an order.");
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return apiError("invalid_request", "Send a JSON object body.");
  }

  // Namespaced by owner so two integrations cannot collide on a key as
  // unimaginative as "1" and have one silently receive the other's order.
  const result = await createOrder(
    actor,
    body,
    { actor, ip: null, userAgent: null },
    actor.id,
    `api:${actor.id}:${key}`,
  );
  if (!result.ok) return apiError("invalid_request", ERRORS[result.error] ?? result.error);
  // 200 rather than 201 on a replay: nothing was created this time, and a
  // client distinguishing the two can tell its retry was recognised.
  return Response.json({ data: { id: result.id } }, { status: result.deduped ? 200 : 201 });
});

/** Service refusals → sentences a human integrator can act on. The CODE the
 * caller branches on is in the envelope; this is only the message. */
const ERRORS: Record<string, string> = {
  "unknown-sku": "No SKU with that product_variant_id exists.",
  "sku-inactive": "That SKU is not currently active and cannot be ordered.",
  "cannot-create-for-others": "This key may only create orders for its own account.",
};
