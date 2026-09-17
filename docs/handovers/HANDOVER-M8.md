# M8 handover — deployment, security pass, documentation, demo, CV package, main cutover (Tasks 28–32)

**Status: Tasks 29–31 complete and verified. Tasks 28 and 32 are genuinely
blocked, not just undone — see below.** Built on `ff/m5-shopify-sync-back`
(M7 complete, HANDOVER-M7). No deployment, no Railway project, and no
merge to `main` was performed or attempted.

## Plan source and scope

`docs/superpowers/specs/2026-09-14-fulfillflow-complete-implementation-plan.md`,
M8 section (Tasks 28–32) and Gate M8.

## What was built

### Task 29 — security/data-handling review

`docs/security/data-handling.md` and `threat-model.md`: checked against the
actual code as of M7, not a generic template — each checklist line names
the file that makes it true, or is flagged as an open gap. Found and fixed,
not just flagged, one real gap the checklist itself called for: merchant
WRITE endpoints had no rate limiting. Added `MerchantWriteRateLimitGuard`
(in-memory, per-tenant, 30 writes/min, no new dependency) wired into
`POST`/`PATCH`/`DELETE` on `/app/automation-rules`. `npm audit --omit=dev`:
12 vulnerabilities, all transitive inside `@prisma/adapter-pg`'s own
dependency tree, none reachable from this app's runtime code, documented
as a tracked gap (every available fix requires downgrading off Prisma 7).

### Task 30 — ADRs and README

ADR-01 through ADR-06 written this milestone (M7's own handover already
recorded ADR-07/08 existed but 01–06 never had been, despite M2's Task 1
calling for ADR-01/02 back then) — see HANDOVER-M7 for the full list and
what each documents; the short version: order-management-not-fulfillment-
service (01), expiring-token auth (02), no-embedded-UI-in-V1 (03),
`@fulfillflow/core` for cross-app logic (04), `ExceptionCase` as the one
"needs a human" row type (05), Postgres outbox/no-broker (06).

Root `README.md` was **stale from before the FulfillFlow rebuild even
started** — still describing the old "gwprint" Next.js/Vercel
dashboard+storefront monorepo, none of which exists in this codebase
anymore (`apps/dashboard`, `apps/storefront` were never real directories
here; this repo has only ever had `apps/api`/`apps/worker` since M1).
Rewritten in the plan's specified order (business problem → product
thesis → 60-second architecture overview with a Mermaid diagram → golden
path → exception/recovery path → Shopify integration → consistency/
idempotency/concurrency → data handling/security → tests and measured
benchmarks → local dev setup → trade-offs/V1 limitations), no install
commands as the opener, no scale claims beyond what's actually measured.

### Task 31 — demo script and portfolio package

`docs/demo/demo-script.md`: the intended 90-second script, explicitly
marked as designed-but-not-yet-run against live Shopify (Gate H0 still
open — see below), with a second section on what's actually reproducible
today without it (the M5/M6 acceptance and reliability suites covering the
same mechanics against a fake Shopify server, cited by file).
`docs/portfolio/cv-bullets.md`: bullets only for what's actually true and
measured, each citing its backing test/benchmark/file, with an explicit
"do not use yet" section for anything the live dev-store run would be
needed to claim honestly (Shopify infrastructure integration claims,
protected-customer-data review, real-store installation).
`docs/portfolio/interview-stories.md`: three real engineering stories from
this build (the M7 load-benchmark concurrency bug, the
`exception_has_subject` constraint tripped by test cleanup order rather
than service logic, and the recurring libs/core sharing decision), each
with the actual file/test a follow-up question could be answered from.

## Tasks 28 and 32 — genuinely blocked, not skipped

**Task 28 (separate Railway FulfillFlow project):** requires creating real
infrastructure — a new Railway project, a production Postgres instance,
configured secrets — under this session's own credentials/access, which is
an external, costly, and irreversible-in-practice action (a live database,
real billing) that a coding session should not take unilaterally without
explicit per-instance authorization, per this session's own operating
rules around destructive/high-blast-radius actions. It also has no
technical prerequisite blocking it — the API/worker Dockerfiles, env var
list, and migration-as-release-step approach are all already correct per
the plan's Task 28 checklist; what's missing is the human decision to
actually spend money and create the resource, not more code.

**Task 32 (final verification + cutover to `main`):** its own ten-point
checklist is explicitly a live-Shopify-plus-Railway verification (webhook
inserts once against the real endpoint, mapped order accepted, route/
reserve/ship against real data, Shopify fulfillment/tracking actually
syncs, duplicate sync doesn't duplicate, uninstall/reinstall tested live,
privacy purge tested live) — every one of those needs Task 19/Gate M5's
Human Setup Gate H0 (a real Shopify dev store + API credentials), which has
been open and unaddressed since HANDOVER-M2 first raised it and remains so
through M3, M4, M5, M6, and M7. **Nothing in M6 or M7 touched or resolved
H0** — it is not a regression, it was never closed. Task 32 also explicitly
gates the merge to `main` on all ten checks passing, so attempting the
merge without them would violate the plan's own instruction, not just skip
optional polish.

**What actually unblocks these:** a human (a) creates the Shopify dev
store + app credentials per Gate H0's documented prerequisites
(`docs/demo/closed-loop-checklist.md`), and (b) explicitly authorizes
Railway project creation and provides/approves the billing decision that
implies. Once both exist, Task 19's live closed-loop run, Task 28's Railway
setup, and Task 32's ten-point verification can all proceed in one
subsequent session — nothing else in the codebase is missing for them.

## Verification — 2026-09-17

| Check | Result |
| --- | --- |
| `npm run build` | PASS; 5 workspaces, zero type errors |
| New rate-limit guard unit tests | PASS (2 tests) |
| Full merchant test suite (rate limit doesn't break existing CRUD flow) | PASS (10 tests) |
| `npm test` at repo root, real Postgres | PASS: 203/203 (db 6, core 52, api 63, worker 82) |
| Legacy-name guard (manual grep for gwprint/gwp-ds across every file changed this session, including the README rewrite that specifically removes the last "gwprint" references) | PASS, no matches outside the historical mention in this handover and HANDOVER-M7/CLAUDE.md's own `legacy/gwprint-v1` branch reference, both intentional |
| `git diff --check` | PASS |

## Follow-up: detailed audit pass over Tasks 29–31 — 2026-09-17

A second, more rigorous pass re-checked every factual claim in the Task
29–31 docs (`data-handling.md`, `threat-model.md`, all six ADRs,
`README.md`, `demo-script.md`, `cv-bullets.md`, `interview-stories.md`)
against the actual code, using a parallel multi-agent audit with
adversarial verification (each flagged discrepancy independently
re-derived from source before being counted, not taken on the first
agent's word). Result: 95 claims confirmed accurate, 12 confirmed real
discrepancies (0 false alarms), plus 4 minor improvement notes.

**Code fixes** (3, addressing the discrepancies that were code bugs, not
just doc drift):
- `apps/api/src/operator/operator-api-key.guard.ts` — the operator API key
  comparison was a plain `!==`, inconsistent with the timing-safe pattern
  already used in `hmac.ts`/`session-token.ts`; switched to
  `node:crypto.timingSafeEqual`.
- `apps/worker/src/handlers/noop-echo.handler.ts` — was `console.log`-ing
  `event.payload` unredacted; routed through the redacting `logger`
  (matches `data-handling.md`'s stated defense-in-depth backstop, which the
  audit found this handler bypassed entirely).
- `apps/worker/src/queue/ingestion-claim-loop.test.ts` — added the
  expiry-then-reclaim test the threat model's T6 had been citing this file
  for without the file actually containing it (`"an expired lease makes
  the record claimable again (crash recovery)"`).

**Doc fixes** (12, one per confirmed discrepancy): narrowed the
`.env.example` claim in `data-handling.md` to the one workspace that
actually has one; reworded the "defense-in-depth backstop" paragraph to
describe `logger.ts`'s real (still narrow, even after the noop-echo fix)
footprint; rewrote the "Dependency audit" section with correct root-cause
attribution (`@nestjs/core`/`@nestjs/platform-express`/`multer` are
`apps/api`'s own direct deps, not pulled in by `@prisma/adapter-pg`); fixed
`threat-model.md`'s T6 citation and added a T9 entry for operator-key
compromise; removed the false "only" from ADR-01's scope claim and noted
the code-default/CI scope divergence; fixed ADR-02's `expiring=1` claim and
its nonexistent `TokenCryptoService` reference; fixed ADR-03's "Playwright
is installed" wording; fixed `README.md`'s per-workspace `.env.example`
claim; fixed ADR-04's "reaffirmed three times... M7 ×2" to the correct
"reaffirmed twice... (M5, M7)"; hedged `demo-script.md`'s SKU-mapping step
to match `closed-loop-checklist.md`'s own honesty about that API not
existing yet; fixed a `demo-script.md` line conflating M8's 203/203 single
run with M7's 201/201 three-consecutive-run gate.

Verification: `npm test` at repo root, real Postgres, three consecutive
clean runs — 204/204 each time (db 6, core 52, api 63, worker 83; the
extra test vs. the 203 baseline is the new lease-expiry-reclaim test
above). `git diff --check` clean.

Not addressed (optional, low-value): two "improvement" notes about ADR-01/
ADR-03 not disclosing they were recorded retroactively at M8 for decisions
made at M2/M3 (git-blame-only concern, not a factual error), and a note
that `MetricsController` shares `OperatorApiKeyGuard` with `/operator/**`
without being under that path literally (not a doc contradiction).

## What's left for a future session

In order of what unblocks the most: (1) a human completes Gate H0
(Shopify dev store + credentials); (2) with H0 closed, run Task 19's live
closed-loop demo and update `docs/demo/closed-loop-checklist.md`'s status;
(3) a human authorizes Task 28's Railway project creation; (4) Task 32's
ten-point verification against both, then the `fulfillflow-v2 → main`
merge and `v2.0.0-portfolio` tag Gate M8 itself describes as "done."
Everything else the plan asks for — M2 through M8's Tasks 1–31 — is built,
tested, and documented as of this session.
