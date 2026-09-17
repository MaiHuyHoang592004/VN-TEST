import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { MerchantWriteRateLimitGuard } from "./merchant-write-rate-limit.guard.js";

function contextFor(organizationId: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ tenant: { organizationId } }) }),
  } as unknown as ExecutionContext;
}

test("allows requests under the limit and rejects the one that exceeds it", () => {
  const guard = new MerchantWriteRateLimitGuard();
  const ctx = contextFor(`org-${crypto.randomUUID()}`);
  for (let i = 0; i < 30; i++) assert.equal(guard.canActivate(ctx), true);
  assert.throws(() => guard.canActivate(ctx), HttpException);
});

test("tracks each tenant independently — one org's burst never throttles another's", () => {
  const guard = new MerchantWriteRateLimitGuard();
  const a = contextFor(`org-a-${crypto.randomUUID()}`);
  const b = contextFor(`org-b-${crypto.randomUUID()}`);
  for (let i = 0; i < 30; i++) assert.equal(guard.canActivate(a), true);
  assert.throws(() => guard.canActivate(a), HttpException);
  assert.equal(guard.canActivate(b), true);
});
