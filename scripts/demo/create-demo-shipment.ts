/**
 * M5 Task 19 demo helper: progresses one already-ingested, routed, and
 * reserved order through the internal operator lifecycle (start →
 * complete-production → ship) with synthetic tracking, so the 90-second
 * demo doesn't need three separate curl commands typed live. It looks up
 * the order/fulfillment directly (read-only — there is no merchant Orders
 * API in this build to ask instead), but every state change goes through
 * the same /operator/fulfillments HTTP API a human would use — nothing
 * here bypasses fulfillment-command.service.ts or shipment.service.ts.
 *
 * Usage (from repo root):
 *   node --env-file-if-exists=apps/api/.env.local --experimental-strip-types \
 *     scripts/demo/create-demo-shipment.ts --order "#1001" [--carrier "Demo Post"] [--tracking DEMO123]
 *
 * Requires APP_URL and OPERATOR_API_KEY in the environment (see
 * apps/api/.env.local) and the order to already be QUEUED or further along
 * (i.e. Shopify ingestion + routing + reservation already ran).
 */
import { prisma } from "@fulfillflow/db";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return args;
}

async function callOperator(appUrl: string, apiKey: string, path: string, body?: unknown) {
  const res = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Operator-Api-Key": apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orderRef = args.order;
  if (!orderRef) throw new Error("usage: create-demo-shipment.ts --order <displayNumber or externalId>");
  const appUrl = process.env.APP_URL ?? process.env.SHOPIFY_APP_URL;
  const apiKey = process.env.OPERATOR_API_KEY;
  if (!appUrl) throw new Error("set APP_URL (or SHOPIFY_APP_URL) in the environment");
  if (!apiKey) throw new Error("set OPERATOR_API_KEY in the environment");

  const order = await prisma.order.findFirst({
    where: { OR: [{ displayNumber: orderRef }, { externalId: orderRef }] },
    include: { fulfillments: true },
  });
  if (!order) throw new Error(`no canonical Order found for "${orderRef}" — has it been ingested yet?`);
  if (order.fulfillments.length !== 1) {
    throw new Error(`expected exactly one Fulfillment for order ${orderRef}, found ${order.fulfillments.length} — this demo script only handles V1's single-facility case`);
  }
  const fulfillment = order.fulfillments[0];
  console.log(`order ${orderRef} -> fulfillment ${fulfillment.id} (status ${fulfillment.status})`);

  if (fulfillment.status === "QUEUED") {
    await callOperator(appUrl, apiKey, `/operator/fulfillments/${fulfillment.id}/start`);
    console.log("started production");
  }
  if (fulfillment.status === "QUEUED" || fulfillment.status === "IN_PRODUCTION") {
    await callOperator(appUrl, apiKey, `/operator/fulfillments/${fulfillment.id}/complete-production`);
    console.log("completed production");
  }

  const items = await prisma.fulfillmentItem.findMany({ where: { fulfillmentId: fulfillment.id } });
  const trackingNumber = args.tracking ?? `DEMO-${Date.now()}`;
  const shipment = await callOperator(appUrl, apiKey, `/operator/fulfillments/${fulfillment.id}/ship`, {
    items: items.map((i) => ({ fulfillmentItemId: i.id, quantity: i.quantity })),
    carrier: args.carrier ?? "Demo Carrier",
    trackingNumber,
  });
  console.log(`shipped: shipment ${shipment.id}, tracking ${trackingNumber}`);
  console.log("Shopify sync runs asynchronously via the worker's outbox loop — check the order in Shopify admin shortly.");
}

main()
  .catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
