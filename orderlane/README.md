# Orderlane

A multi-tenant fulfillment workspace: catalogue, orders, production and
shipping in one place, with a fulfillment process each merchant configures
rather than inherits.

## The problem

Small retail brands run fulfillment across disconnected tools. Orders arrive in
a spreadsheet, artwork lives in a shared drive, stock is counted in a second
spreadsheet, and money is reconciled in a third. Nothing answers "where is this
order, and what is it waiting on?" without opening three tabs and trusting that
somebody updated all of them.

The tools that do exist assume one process. They ship a fixed order lifecycle,
which fits the shop it was built for and nobody else.

## The approach

Four decisions, each written up in [`docs/design`](./docs/design):

**The fulfillment lifecycle is configuration, not a type.** A merchant defines
their own states and transitions, with guards stored as data. The engine is a
dependency-free package that does not know what an order is. Shipping two
example processes — one linear, one with a proofing loop and a rework loop —
is how the design proves it is an engine rather than one shop's enum with extra
steps. → [workflow-engine.md](./docs/design/workflow-engine.md)

**Money is a double-entry ledger.** Immutable postings, one invariant (debits
equal credits, enforced at write time), and balances projected from entries
rather than stored in a column that can drift.
→ [ledger.md](./docs/design/ledger.md)

**Bulk import stages, previews, then commits.** Nothing touches a domain table
until an operator has seen "will create 12, update 3, skip 480, reject 5 —
here's why". Row identity is a hash of business content, so re-uploading a
corrected spreadsheet updates exactly the row that changed.
→ [import-pipeline.md](./docs/design/import-pipeline.md)

**Tenant isolation is a mechanism, not a discipline.** Every scoped query gets
its filter from a Prisma client extension. A caller cannot widen it, and a
model added without deciding about isolation fails CI.
→ [domain-model.md](./docs/design/domain-model.md)

## Stack

Next.js · TypeScript · Prisma 7 · PostgreSQL · Turborepo · npm workspaces

```
apps/web          the application
packages/core     domain logic — no dependencies, no database
packages/db       Prisma schema, client, tenant scoping
docs/design       why the above is shaped the way it is
```

`packages/core` having no dependencies is a design constraint, not a
coincidence: the workflow engine, the ledger invariants and the import planner
are pure functions over plain data, so they run under `node --test` with
nothing installed and no fixtures.

## Running it

```bash
npm install
npm test                      # domain logic; needs no database
cp .env.example .env.local    # only DATABASE_URL is required
npm run db:migrate -w @orderlane/db
npm run dev
```

A fresh clone runs with no third-party account. Storage defaults to local disk;
the shipping carrier defaults to a deterministic fake that issues stable labels
and tracking numbers offline. Both are ports with a real driver behind the same
interface.

## Status

Built:

- domain model — 30 models, schema validates, tenant scoping enforced and
  tested against the schema itself
- workflow engine — states, transitions, data guards, definition validation
  including reachability and dead-end detection, two example processes
- ledger — postings, the balance invariant, reversal, snapshot projection
- import planner — canonical row hashing, two-phase planning, partial failure

Not built yet: the application's screens beyond a holding page, the seed
generator, auth, the storage and carrier drivers. The order in which those
land is in [`docs/design/README.md`](./docs/design/README.md).

The data in this repository is synthetic. There are no customers, no real SKUs
and no real prices in it, and `scripts/check-clean-room.sh` runs in CI to keep
it that way.

## Licence

MIT.
