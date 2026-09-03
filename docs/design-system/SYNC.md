# Sync checklist — repo → design system

The full logic lives in `github.md`; this is the short, unattended run-through
for keeping this design system current when the source repo changes. One turn,
no questions.

**Repo:** `MaiHuyHoang592004/GWP` · branch `main` · path
`fulfillment-fe-new-prod/fulfillment-fe-new-prod/src` (backend enums under
`fulfillment-system-be-prod/src`).

## Steps

1. **Recover state.** Read `github.md` → `## Last sync` (date + last commit if
   recorded) and the `## Screen map` tables (screen → source files).
2. **Diff.** `github_compare(base = last-sync commit, head = main)` — or, if no
   commit was recorded, re-read the files behind any screen you suspect changed.
   Scope with `path_prefix` to the module that moved.
3. **Rebuild only what changed.** For each changed source file, find the
   screen(s) that cite it in the Screen map and update those `ui_kits/*.html`
   only. Don't touch unrelated screens.
4. **Re-derive contracts if enums/columns moved.** If `metadata.ts`,
   `orders/constants.js`, `OrderActionButtons.jsx`, `ticket` enums or a
   `*Columns.jsx` changed, update `DOMAIN_RESOLVED.md` (verbatim) and any
   affected `StatusBadge`/manifest `domainBound` entries.
5. **Regenerate the manifest** if screens were added/removed or their component
   set changed: re-run the extraction that produced `ui_kits/screen-manifest.json`
   (scan each screen's `const { … } = NS` destructure) and merge with the route
   map already in that file.
6. **Validate.**
   - `check_design_system` → must report **No issues** + manifest in sync.
   - **Token coverage** → the machine-readable export must not drift behind the
     CSS. Run this from the project root (Node):

     ```js
     // check-tokens.mjs — save & run: node check-tokens.mjs
     import { readFileSync, readdirSync } from "node:fs";
     const defined = new Map();
     for (const f of readdirSync("tokens").filter((f) => f.endsWith(".css"))) {
       const css = readFileSync(`tokens/${f}`, "utf8");
       const re = /(^|[\s;{])(--[a-z0-9-]+)\s*:/gi; let m;
       while ((m = re.exec(css))) if (!defined.has(m[2])) defined.set(m[2], f);
     }
     const tj = readFileSync("tokens.json", "utf8");
     const inJson = new Set(); let m; const r = /--[a-z0-9-]+/gi;
     while ((m = r.exec(tj))) inJson.add(m[0]);
     const missing = [...defined.keys()].filter((n) => !inJson.has(n));
     console.log(missing.length ? "MISSING: " + missing.join(", ") : "OK — tokens.json covers every CSS token.");
     if (missing.length) process.exit(1);
     ```

     (Last run this pass: 238 tokens defined, 0 missing.)
7. **Write the receipt.** Update `github.md` `## Last sync` (real current ISO
   timestamp + `### Updated in this project` bullets), move the previous
   Last-sync block into `## Sync history`, and refresh the Screen map rows you
   rebuilt.

## Never, during a sync

- Invent business truth for a field the API still doesn't return — keep it in
  `BACKEND_ASKS.md` / `BACKEND_GAPS.md` and ship the placeholder.
- Translate or re-group an enum value (`ORDER_STATUS`, `Ticket*`, `USER_ROLE`).
- Promote a DOMAIN-BOUND field to real behaviour because it "probably works
  that way" — only a source read moves it into `DOMAIN_RESOLVED.md`.
