/**
 * GET   /api/v1/orders/:id   one order
 * PATCH /api/v1/orders/:id   partial update (doc 07 F1)
 *
 * getOrder re-reads through the caller's scope, so another seller's order id
 * resolves to nothing rather than to a column. The wrapper turns that miss into a
 * 404, not a 403 — a 403 would confirm the id exists, which is the difference
 * between "you can't see this" and "there is nothing here".
 *
 * PATCH replaces THREE legacy routes: patch, resolve-design and resolve-label.
 * Which one you meant is decided by what you send — a design URL releases a
 * held order, a label + tracking number attaches a shipment through the same
 * linkLabel the scan stations use.
 */
import { getOrder, patchOrder, PatchError } from "@/modules/fulfillment/orders/service.ts";
import { linkLabel } from "@/modules/fulfillment/stations/service.ts";
import { withApiKey, apiError } from "../../_lib/with-api-key.ts";
import { orderToApi } from "../../_lib/serialize.ts";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (_req, actor, { params }) => {
  const order = await getOrder(actor, Number(params.id));
  return Response.json({ data: orderToApi(order) });
});

export const PATCH = withApiKey(async (req, actor, { params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return apiError("not_found", "No such order.");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return apiError("invalid_request", "Send a JSON object body.");
  }

  const ctx = { actor, ip: null, userAgent: null };
  // A label is a SHIPMENT, which belongs to the stations module — so it is
  // composed here rather than smuggled into the order patch. Same function the
  // floor uses, so the seller notification and the audit column are identical.
  const {
    label_url: labelUrl,
    tracking_number: trackingNumber,
    carrier,
    ...rest
  } = body;
  let linked = 0;
  if (labelUrl || trackingNumber) {
    if (!labelUrl || !trackingNumber) {
      return apiError(
        "invalid_request",
        "label_url and tracking_number must be sent together.",
      );
    }
    const result = await linkLabel(
      actor,
      {
        orderIds: [id],
        labelUrl: String(labelUrl),
        trackingNumber: String(trackingNumber),
        provider: typeof carrier === "string" ? carrier : undefined,
      },
      ctx,
    );
    linked = result.linked;
    if (!linked) return apiError("not_found", "No such order.");
  }

  let released = false;
  if (Object.keys(rest).length) {
    try {
      const result = await patchOrder(actor, id, rest, ctx);
      released = result.released;
    } catch (e) {
      if (e instanceof PatchError) {
        const code =
          e.code === "not-found" ? "not_found" : e.code === "conflict" ? "conflict" : "invalid_request";
        return apiError(code, e.message);
      }
      throw e;
    }
  } else if (!linked) {
    return apiError("invalid_request", "The body had no fields to update.");
  }

  // The updated column, read back through the scope — a PATCH that answers with
  // the new state saves every integration a follow-up GET.
  const order = await getOrder(actor, id);
  return Response.json({ data: orderToApi(order), meta: { released, label_linked: linked > 0 } });
});
