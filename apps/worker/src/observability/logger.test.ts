import { test } from "node:test";
import assert from "node:assert/strict";
import { logger } from "./logger.js";

function capture(fn: () => void): string {
  const real = console.log;
  let captured = "";
  console.log = (line: string) => { captured = line; };
  try { fn(); } finally { console.log = real; }
  return captured;
}

test("redacts token/secret/password/authorization fields, including nested ones", () => {
  const line = capture(() => logger.info("token refreshed", {
    storeId: "store-1",
    accessToken: "shpat_should_not_appear",
    nested: { refresh_token: "also_should_not_appear", headers: { Authorization: "Bearer nope" } },
    password: "hunter2",
    apiKey: "sk-nope",
  }));
  const parsed = JSON.parse(line);
  assert.equal(parsed.msg, "token refreshed");
  assert.equal(parsed.storeId, "store-1");
  assert.equal(parsed.accessToken, "[REDACTED]");
  assert.equal(parsed.nested.refresh_token, "[REDACTED]");
  assert.equal(parsed.nested.headers.Authorization, "[REDACTED]");
  assert.equal(parsed.password, "[REDACTED]");
  assert.equal(parsed.apiKey, "[REDACTED]");
  assert.ok(!line.includes("shpat_should_not_appear"));
  assert.ok(!line.includes("hunter2"));
});

test("leaves ordinary fields alone and is valid JSON with a level/ts", () => {
  const line = capture(() => logger.info("tick", { processed: 3 }));
  const parsed = JSON.parse(line);
  assert.equal(parsed.level, "info");
  assert.equal(parsed.processed, 3);
  assert.ok(parsed.ts);
});
