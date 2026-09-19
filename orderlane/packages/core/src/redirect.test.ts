import { test } from "node:test";
import assert from "node:assert/strict";

import { safeRedirectPath } from "./redirect.ts";

test("an ordinary in-site path is preserved, query and fragment included", () => {
  assert.equal(safeRedirectPath("/t/acme/orders"), "/t/acme/orders");
  assert.equal(safeRedirectPath("/t/acme/orders?cursor=abc#row-3"), "/t/acme/orders?cursor=abc#row-3");
  assert.equal(safeRedirectPath("/"), "/");
});

test("a backslash authority is rejected — the bypass a prefix check misses", () => {
  // /^\/(?!\/)/ accepts every one of these, and a browser reads them all as
  // another origin.
  for (const payload of ["/\\evil.example/phish", "/\\\\evil.example", "\\\\evil.example", "/\\/evil.example"]) {
    assert.equal(safeRedirectPath(payload), "/", `${JSON.stringify(payload)} must not survive`);
  }
});

test("a percent-encoded backslash is NOT the same bypass, and is kept", () => {
  // Worth pinning down, because it is the obvious next guess and it is wrong:
  // the URL parser does not decode %5C before deciding where the authority
  // starts, so "/%5Cevil.example" stays a path on this origin. Rejecting it
  // would break legitimate paths for no gain, and a guard that rejects safe
  // input teaches people to route around it.
  assert.equal(new URL("/%5Cevil.example/phish", "https://app.example.com").origin, "https://app.example.com");
  assert.equal(safeRedirectPath("/%5Cevil.example/phish"), "/%5Cevil.example/phish");
  assert.equal(safeRedirectPath("/%5cevil.example/phish"), "/%5cevil.example/phish");
});

test("the payload really would have crossed origins", () => {
  // Pinning the premise, so this test still means something if someone later
  // wonders why the plain prefix check was not enough.
  assert.equal(/^\/(?!\/)/.test("/\\evil.example/phish"), true, "the naive check accepts it");
  assert.equal(new URL("/\\evil.example/phish", "https://app.example.com").origin, "https://evil.example");
});

test("protocol-relative and absolute URLs are rejected", () => {
  for (const payload of [
    "//evil.example",
    "//evil.example/path",
    "https://evil.example",
    "http://evil.example/phish",
    "https://app.example.com/t/acme/orders",
  ]) {
    assert.equal(safeRedirectPath(payload), "/", `${JSON.stringify(payload)} must not survive`);
  }
});

test("non-http schemes are rejected", () => {
  assert.equal(safeRedirectPath("javascript:alert(1)"), "/");
  assert.equal(safeRedirectPath("data:text/html,<script>alert(1)</script>"), "/");
  assert.equal(safeRedirectPath("mailto:someone@example.com"), "/");
});

test("control characters are rejected before the parser sees them", () => {
  assert.equal(safeRedirectPath("/orders\r\nLocation: https://evil.example"), "/");
  assert.equal(safeRedirectPath("/orders\u0000"), "/");
  assert.equal(safeRedirectPath("/orders\u007f"), "/");
});

test("a relative path is not a redirect target", () => {
  assert.equal(safeRedirectPath("orders/1"), "/", "rooted or nothing");
  assert.equal(safeRedirectPath("./orders"), "/");
  assert.equal(safeRedirectPath("../../etc"), "/");
});

test("absent, empty and non-string inputs fall back", () => {
  assert.equal(safeRedirectPath(undefined), "/");
  assert.equal(safeRedirectPath(null), "/");
  assert.equal(safeRedirectPath(""), "/");
  assert.equal(safeRedirectPath(42), "/");
  assert.equal(safeRedirectPath({ toString: () => "/evil" }), "/");
});

test("a caller may choose its own fallback", () => {
  assert.equal(safeRedirectPath("//evil.example", "/signin"), "/signin");
  assert.equal(safeRedirectPath("/kept", "/signin"), "/kept");
});

test("traversal is normalised away rather than passed through", () => {
  assert.equal(safeRedirectPath("/a/../b"), "/b");
  assert.equal(safeRedirectPath("/../../../etc/passwd"), "/etc/passwd", "still same-origin, and harmless as a route");
});
