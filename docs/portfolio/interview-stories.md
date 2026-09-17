# Interview stories

Real engineering moments from building FulfillFlow, each with the actual
file/commit to point to if asked to go deeper. Written in STAR shape but
kept short — the point is to remember the shape of the story, not recite it
verbatim.

## 1. Finding a concurrency bug with a load-testing script, not a code review

**Situation:** M7 called for a synthetic load benchmark. No k6 in the
environment, so I wrote a small Node script that fires concurrent HMAC-
signed webhook requests at the real, already-tested `POST /webhooks/shopify`
endpoint — including some requests deliberately reusing an already-sent
delivery id, some of them genuinely concurrent with their own original.

**Task:** Get an honest throughput/error-rate number, per the plan's own
"never claim production scale" instruction — which meant not explaining
away a bad number without understanding it first.

**Action:** First run: ~28% error rate. Before assuming a real bug, I
isolated the cause — turned out to be two layered problems. The first was
a test-harness artifact: `supertest` against a Nest app that's never
`.listen()`'d implicitly opens and closes an ephemeral socket per request,
and under real concurrency that churn throws spurious `ECONNRESET`s
unrelated to server behavior. I fixed the harness (explicit `.listen(0)` +
plain `fetch`) and re-ran — error rate dropped, but didn't hit zero. Under
that noise was a second, real bug: Prisma 7's `upsert()` isn't atomic
against a truly concurrent duplicate delivery of the same webhook id — it
surfaces the race as either a unique-constraint violation or "no record
found for an upsert," depending on timing, instead of cleanly folding into
an update. The existing test suite had a duplicate-delivery test, but it
sent the duplicate *sequentially*, which any correct upsert handles fine —
it just never exercised the actual race.

**Result:** Fixed the endpoint to re-read by the unique key on either race
error (the winner's insert has already committed by the time the loser's
error surfaces). Added a regression test that fires 10 genuinely
concurrent requests for the same webhook id against a real listening
server. Re-ran the benchmark: 500 requests, 357 req/s, 0% error rate,
stable across five consecutive runs.

**Why it's worth telling:** it's a case where a "boring" task (write a
benchmark script) surfaced a bug that months of code review and a passing
test suite hadn't — because the test suite's duplicate-delivery test was
testing the *wrong shape* of duplicate. The load test wasn't a formality;
it changed what shape of correctness the endpoint actually had.

## 2. A Postgres constraint I designed correctly, tripped by a test I wrote incorrectly

**Situation:** M6 added inventory ledger reconciliation — comparing summed
movement deltas against a live balance row, opening an exception on drift.
`ExceptionCase` has a CHECK constraint (`exception_has_subject`) requiring
every row to point at something concrete — a real design decision from
earlier in the project, made so an exception can never be unresolvable-by-
construction (nothing to click through to).

**Task:** `Facility`/`InventoryItem` are intentionally global, not tenant-
scoped, so a drift exception has no natural subject of its own. I resolved
this by borrowing the tenant and subject from whichever `Fulfillment` most
recently moved that pair — a reasonable design.

**Action:** My first test passed, then a later one in the same file failed
with the exact CHECK constraint violation I'd designed the feature to
respect. I didn't assume the service was wrong — I wrote a minimal
standalone repro calling the service directly, confirmed it worked cleanly
in isolation, then added step-by-step logging to the *test's* own cleanup
sequence. The actual cause: my test's `finally` block deleted the
`Fulfillment`, then the `Order`, that the exception referenced — and
Postgres's own `ON DELETE SET NULL` for those optional relations nulled the
exception's last remaining subject field one delete at a time, tripping
the very constraint that was working as designed.

**Result:** Fixed by reordering the test's cleanup (delete the exception
before its subject rows), not by touching the service or the constraint.
Documented the trap explicitly in the handover, since the same shape — a
row referencing something that gets deleted out from under it — could
recur anywhere else `ON DELETE SET NULL` and a "must have a subject"
invariant meet.

**Why it's worth telling:** it's an example of not assuming "my test
failed" means "my code is wrong" — and of a database CHECK constraint
doing exactly its job (catching a genuinely invalid state) even when the
thing that produced that state was test cleanup, not application logic.

## 3. Choosing where shared code lives, and getting it wrong the first time on purpose

**Situation:** Several times across the build (M4's routing/inventory, M5's
Shopify token client, M7's policy engine), logic written for one of the two
apps (`apps/api`, `apps/worker`) turned out to be needed by the other too —
and the two apps deliberately don't import each other's source.

**Task:** Decide where genuinely shared logic should live, given the
architecture is a modular monolith with two runtime processes, not a
single app.

**Action:** Rather than pre-emptively moving everything shareable into a
common package up front (speculative abstraction for logic that might
never actually be shared), each piece started in whichever app needed it
first. When a second real consumer appeared, it moved to `libs/core` — a
small, mechanical refactor each time, with two recurring gotchas (relative
import extensions differ between the two apps' test runners; the shared
package's stricter runtime rejects a TypeScript syntax shortcut the apps'
runners accept) that I wrote down the first time so the second and third
moves were faster.

**Result:** `libs/core` today holds exactly the logic that's actually used
by both apps — nothing spec­ulative, nothing moved "just in case." Recorded
as ADR-04 once the pattern repeated a third time, specifically to save the
next person (or myself) from rediscovering the same two gotchas by hand.

**Why it's worth telling:** it's a concrete answer to "how do you decide
when to abstract" — the answer here was "wait for the second real
consumer, then move it, and write down what the move costs so it's cheaper
next time" rather than guessing up front.
