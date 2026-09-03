/**
 * POST /api/webhooks/drx — carrier tracking updates.
 *
 * The slot doc 03 §1 reserved, and the ONE inbound webhook this system has.
 *
 * It reads the RAW body before parsing, because a signature covers bytes, not
 * an object: JSON.parse then re-stringify would compute the digest over a
 * different string than the sender signed, and any key reordering would break
 * every delivery.
 *
 * A missing secret means 401, not "skip the check" — legacy did the latter,
 * which turned this route into an unauthenticated write endpoint on any deploy
 * where the env var was forgotten. Legacy also exposed unauthenticated admin
 * maintenance endpoints alongside it; NEITHER hole is ported.
 */
import { applyTrackingUpdate, verifyTrackingSignature } from "@/modules/fulfillment/tracking/service.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-drx-signature");

  if (!verifyTrackingSignature(raw, signature)) {
    // One answer for missing, malformed and wrong signatures alike: saying
    // which would help someone work out what to forge.
    return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: { code: "invalid_request" } }, { status: 422 });
  }

  // Some carriers batch. Accept either shape rather than making the sender care.
  const events = Array.isArray(payload) ? payload : [payload];
  let updated = 0;
  for (const event of events) {
    const result = await applyTrackingUpdate(event as Parameters<typeof applyTrackingUpdate>[0]);
    updated += result.updated;
  }

  // 200 even when nothing matched: a tracking number we do not know is not an
  // error the sender can act on, and a 4xx would make them retry forever.
  return Response.json({ ok: true, updated });
}
