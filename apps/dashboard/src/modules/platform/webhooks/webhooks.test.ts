/**
 * Outbound webhook delivery: retry on failure, and a log of what actually
 * happened. Both were entirely absent before — dispatchWebhook was
 * fire-and-forget with nothing written down (see the file's own doc-comment
 * for the history). A real local HTTP server stands in for the seller's
 * endpoint, so failure/retry/success are genuine network outcomes, not
 * mocked ones.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";

import { prisma } from "@gwprint/db";
import { dispatchWebhook, signWebhookBody } from "./service.ts";

let sellerId: string;
let server: Server;
let baseUrl: string;
let requestCount = 0;
let failUntilAttempt = 0; // requests numbered from 1; fail while requestCount <= this
let lastRequest: { headers: Record<string, string | string[] | undefined>; body: string } | null = null;

const SECRET = "webhook-test-secret";

before(async () => {
  const seller = await prisma.user.create({
    data: { email: "wht-seller@test.local", roles: ["SELLER"], webhookSecret: SECRET },
  });
  sellerId = seller.id;

  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requestCount++;
      lastRequest = { headers: req.headers, body };
      if (requestCount <= failUntilAttempt) {
        res.writeHead(500).end("nope");
      } else {
        res.writeHead(200).end("ok");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
});

beforeEach(async () => {
  requestCount = 0;
  failUntilAttempt = 0;
  lastRequest = null;
  await prisma.webhookDelivery.deleteMany({ where: { userId: sellerId } });
  await prisma.user.update({ where: { id: sellerId }, data: { webhookUrl: baseUrl } });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.webhookDelivery.deleteMany({ where: { userId: sellerId } });
  await prisma.user.deleteMany({ where: { id: sellerId } });
});

test("a healthy endpoint is delivered on the first attempt and logged DELIVERED", async () => {
  await dispatchWebhook(sellerId, "order_status", { id: 1, status: "FULFILLED" });
  assert.equal(requestCount, 1);

  const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { userId: sellerId } });
  assert.equal(delivery.status, "DELIVERED");
  assert.equal(delivery.attempts, 1);
  assert.equal(delivery.lastError, null);
  assert.equal(delivery.event, "order_status");
});

test("the signature is HMAC-SHA256 over the exact body, in X-Signature", async () => {
  await dispatchWebhook(sellerId, "order_status", { id: 2 });
  assert.ok(lastRequest);
  const sig = lastRequest!.headers["x-signature"];
  const expected = signWebhookBody(SECRET, lastRequest!.body);
  assert.equal(sig, expected);
  assert.equal(createHmac("sha256", SECRET).update(lastRequest!.body).digest("hex"), expected);
});

test("a flaky endpoint that recovers on retry is DELIVERED with attempts > 1, and the event is not lost", async () => {
  failUntilAttempt = 2; // first two attempts 500, third succeeds
  await dispatchWebhook(sellerId, "shipping_added", { tracking_number: "X" });
  assert.equal(requestCount, 3);

  const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { userId: sellerId } });
  assert.equal(delivery.status, "DELIVERED");
  assert.equal(delivery.attempts, 3);
});

test("an endpoint that never recovers is logged FAILED after all retries, not silently dropped", async () => {
  failUntilAttempt = 99; // always fails
  await dispatchWebhook(sellerId, "order_status", { id: 3 });
  assert.equal(requestCount, 3, "immediate + 2 retries, then give up");

  const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { userId: sellerId } });
  assert.equal(delivery.status, "FAILED");
  assert.equal(delivery.attempts, 3);
  assert.ok(delivery.lastError?.includes("500"), "the reason is preserved, not just a boolean");
});

test("no webhookUrl configured means no attempt and no log row — not a FAILED delivery", async () => {
  await prisma.user.update({ where: { id: sellerId }, data: { webhookUrl: null } });
  await dispatchWebhook(sellerId, "order_status", { id: 4 });
  assert.equal(requestCount, 0);
  const count = await prisma.webhookDelivery.count({ where: { userId: sellerId } });
  assert.equal(count, 0, "an unconfigured webhook is not a failure — it is off");
});
