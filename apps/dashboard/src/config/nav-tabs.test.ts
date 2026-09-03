/**
 * Every page reachable from a nav must land in a section that lights ITSELF up.
 *
 * This exists because /admin/materials shipped without a tab: the page rendered
 * the Administration column with nothing highlighted, and there was no way to
 * reach it from that column at all. Nothing failed — no type error, no crash, no
 * test — because a missing tab is missing DATA, not broken code.
 *
 * Phases C and D add more routes to both navs, so the guard is permanent.
 *
 * Run: node --test src/config/nav-tabs.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync, readdirSync } from "node:fs";

import {
  NAV_SECTIONS,
  activeHref,
  activeTabHref,
  isRouteActive,
  sectionFor,
  sectionTabs,
} from "./nav-tabs.ts";

test("every tab resolves to its own section and highlights itself", () => {
  for (const section of NAV_SECTIONS) {
    for (const tab of section.tabs) {
      const found = sectionFor(tab.href);
      assert.equal(
        found?.prefix,
        section.prefix,
        `${tab.href} should belong to ${section.prefix}, got ${found?.prefix ?? "none"}`,
      );
      assert.equal(
        activeTabHref(tab.href, section.tabs),
        tab.href,
        `${tab.href} should highlight itself`,
      );
    }
  }
});

test("a deeper route highlights the deeper tab, not its prefix sibling", () => {
  // The trap the longest-match rule exists for: /inventory/movements matches
  // BOTH /inventory and itself, and a plain startsWith would light up Stock
  // while the user is looking at Movements.
  const inventory = NAV_SECTIONS.find((s) => s.prefix === "/inventory");
  assert.ok(inventory, "the inventory section exists");
  assert.equal(activeTabHref("/inventory/movements", inventory.tabs), "/inventory/movements");
  assert.equal(activeTabHref("/inventory", inventory.tabs), "/inventory");
});

test("materials is reachable from the column its own route renders", () => {
  // The exact bug: the page lives under /admin, so it renders the
  // Administration tabs — and therefore has to BE one of them.
  const section = sectionFor("/admin/materials");
  assert.equal(section?.prefix, "/admin");
  assert.ok(
    section.tabs.some((t) => t.href === "/admin/materials"),
    "/admin/materials must appear in the Administration tabs",
  );
});

test("every sectioned route has a sidebar icon", () => {
  // The sidebar derives its groups from NAV_SECTIONS, so a new tab CANNOT go
  // missing from it any more — /inventory/receipts did exactly that when the
  // two were separate lists. What it can still do is arrive without an icon
  // and render the fallback, so that is what is checked here.
  //
  // Read as TEXT rather than imported: app-sidebar is a "use client" React
  // module, and pulling React into a plain node test to read one object is a
  // worse trade than matching the keys.
  const source = readFileSync(new URL("../components/global/layout/sidebar/app-sidebar.tsx", import.meta.url), "utf8");
  const block = source.match(/const NAV_ICONS[^{]*\{([\s\S]*?)\n\};/);
  assert.ok(block, "NAV_ICONS still exists in app-sidebar.tsx");
  const iconRoutes = new Set([...block[1].matchAll(/"([^"]+)":/g)].map((m) => m[1]));

  for (const section of NAV_SECTIONS) {
    // /profile's tabs live in the account menu, not the sectioned sidebar.
    if (section.prefix === "/profile") continue;
    for (const tab of section.tabs) {
      assert.ok(
        iconRoutes.has(tab.href),
        `${tab.href} is a ${section.prefix} tab but has no icon in NAV_ICONS`,
      );
    }
  }
});

test("the sidebar asks the LIST which item is active, never the item", () => {
  // activeHref being correct is not enough — the bug was in the CALL. The
  // sidebar asked each item `isRouteActive(pathname, href)` independently, so
  // /inventory and /inventory/receipts both answered yes and both lit up.
  // Nothing about that is visible in a pure function test, so the call shape
  // is what gets pinned.
  const source = readFileSync(
    new URL("../components/global/layout/sidebar/app-sidebar.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(
    /isRouteActive\(\s*pathname\s*,\s*href\s*\)/.test(source),
    false,
    "per-item isRouteActive is back in the sidebar — it highlights every ancestor",
  );
  assert.ok(source.includes("activeHref(pathname"), "and the list rule is what it uses instead");
});

test("sectionTabs is what the sidebar reads, and it is not empty", () => {
  // If this ever returns [] for a real prefix the sidebar group silently
  // vanishes — worse than a missing column, because nothing looks wrong.
  for (const prefix of ["/inventory", "/admin", "/fulfillment"]) {
    assert.ok(sectionTabs(prefix).length > 0, `${prefix} has tabs`);
  }
  assert.deepEqual(sectionTabs("/nope"), [], "an unknown prefix is empty, not a throw");
});

/**
 * Routes that exist on purpose with nothing pointing at them. Each needs a
 * reason, because "no nav points here" is otherwise indistinguishable from the
 * bug this file exists for.
 */
const UNNAVIGABLE: Record<string, string> = {
  "/orders/print": "a print view, opened from the orders page with a selection",
  "/admin/products/[id]/variants": "a detail page, reached from the products table",
  "/[...comingSoon]": "the catch-all for routes that have no page yet",
  "/tickets/[id]": "one ticket's thread, opened from the tickets table",
  "/notifications": "the bell's archive, reached from its View All — chrome, not a section",
};

test("every page is reachable from a nav, or says why not", () => {
  // The LAST hole in the nav story. Deriving the sidebar from NAV_SECTIONS
  // made "a section route missing from one nav" unrepresentable — but nothing
  // yet caught a page that no nav mentions AT ALL, which is how
  // /admin/materials shipped unreachable from the column its own route renders.
  const appDir = new URL("../app/(protected)/", import.meta.url);
  const routes: string[] = [];
  const walk = (dir: URL, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // Route groups "(name)" do not appear in the URL.
        const segment = entry.name.startsWith("(") ? "" : `/${entry.name}`;
        walk(new URL(`${entry.name}/`, dir), prefix + segment);
      } else if (entry.name === "page.tsx") {
        routes.push(prefix || "/");
      }
    }
  };
  walk(appDir, "");

  // Everything any nav can reach: the sections, plus the sidebar's two
  // sectionless lists (main and account), read as text for the same reason
  // NAV_ICONS is.
  const sidebar = readFileSync(
    new URL("../components/global/layout/sidebar/app-sidebar.tsx", import.meta.url),
    "utf8",
  );
  const reachable = new Set<string>([
    ...NAV_SECTIONS.flatMap((s) => s.tabs.map((t) => t.href)),
    ...[...sidebar.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]!),
  ]);

  const orphans = routes.filter((r) => !reachable.has(r) && !(r in UNNAVIGABLE));
  assert.deepEqual(
    orphans,
    [],
    `these pages exist but no nav points at them — add them to NAV_SECTIONS, or to UNNAVIGABLE with a reason`,
  );
});

test("AT MOST ONE item per nav list is ever active", () => {
  // The bug this pins: /inventory is both a tab AND the prefix of every other
  // inventory tab, so asking each item "am I active?" lit Stock and Receipts
  // together, and the pair only cleared on leaving the section. A nav must ask
  // the LIST which one wins, never the item.
  for (const section of NAV_SECTIONS) {
    const hrefs = section.tabs.map((t) => t.href);
    for (const pathname of [...hrefs, `${section.prefix}/made/up/route`]) {
      const active = activeHref(pathname, hrefs);
      const lit = hrefs.filter((h) => h === active);
      assert.equal(lit.length <= 1, true, `${pathname} lights at most one of ${section.prefix}`);
      if (hrefs.includes(pathname)) {
        assert.equal(active, pathname, `${pathname} lights ITSELF, not its prefix sibling`);
      }
    }
  }
});

test("isRouteActive stays a prefix test — it is the primitive, not the rule", () => {
  // Kept prefix-matching ON PURPOSE: it answers "is this route an ancestor of
  // where I am?", which is what makes /orders stay lit on /orders/print, where
  // the deeper route is not itself a nav item. activeHref is what turns that
  // into "which ONE", and mixing the two up is what caused the double
  // highlight.
  assert.equal(isRouteActive("/inventory/movements", "/inventory"), true);
  assert.equal(isRouteActive("/inventory", "/inventory/movements"), false);
  assert.equal(isRouteActive("/admin/materials", "/admin/materials"), true);
  // "/" is exact, or Home would be lit on every page in the app.
  assert.equal(isRouteActive("/inventory", "/"), false);
  assert.equal(activeHref("/orders/print", ["/", "/orders"]), "/orders", "and Home stays dark");
});
