# Design

Four decisions carry this project. They are written down first because the
reasoning is the part worth reviewing — the CRUD around them is not.

| Document | The decision |
|---|---|
| [domain-model.md](./domain-model.md) | Multi-tenant by membership; an order is a document, fulfillment is the work |
| [workflow-engine.md](./workflow-engine.md) | The fulfillment lifecycle is configuration, not an enum |
| [ledger.md](./ledger.md) | Money is a double-entry ledger of immutable postings, not a balance column |
| [import-pipeline.md](./import-pipeline.md) | Bulk import stages, previews, then commits — and is idempotent by content |

Each follows the same shape: the problem, the decision, what was rejected and
why, the costs the decision brings, and how it is tested. The costs sections
are not modesty — a design note without them is a sales pitch.

## Conventions these share

**Money** is an integer count of minor units with an explicit currency, never a
float and never a bare number. Fields carry a `Minor` suffix so the unit is
visible at the call site.

**Derived state is always reconstructible.** Balance snapshots and stock counts
are caches over append-only logs. Deleting every cached row must change no
answer, only the time taken to get it — that property is what makes them safe.

**Validation reports everything at once.** Guards, ledger postings and import
rows all return the full list of problems rather than the first. Somebody
fixing four things should not have to submit four times to find them.

**Unknown input denies.** An unregistered guard kind, an unhandled Prisma
operation, an unmapped carrier status: each refuses rather than passes through.
The opposite default turns a typo in configuration into a silently removed
safety check.
