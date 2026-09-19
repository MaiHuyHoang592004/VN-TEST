# Domain model

## The shape

```
Tenant ─┬─ Membership ── User
        ├─ Product ── Variant ────────────┐
        ├─ Order ── OrderLine ────────────┤
        │             │                   │
        │             └─ FulfillmentLine ─┤
        ├─ Fulfillment ── Shipment        │
        │     └─ WorkflowInstance ── TransitionLog
        ├─ LedgerAccount ── LedgerEntry ── LedgerTransaction
        ├─ Location ── StockItem ── StockMovement
        └─ ImportJob ── ImportRow
```

Thirty-one models. The count matters less than the shape: no entity exists to
record a step in one company's process.

## Tenant isolation

**Decision.** A `Tenant` owns rows; a `Membership` grants a `User` a role in a
tenant. Every tenant-owned table carries `tenantId`, and the filter is applied
by a Prisma client extension (`packages/db/src/tenant-scope.ts`), not by
callers.

**Rejected: a role enum on `User`.** It encodes one organisation's job titles
as a database type, and it has no answer for a person who works with two
merchants — the question "which tenant is this ADMIN an admin of?" has no
column to hold it.

**Rejected: `where: { tenantId }` at every call site.** It works until the one
query that forgets, and that query does not throw. It returns another tenant's
rows, passes review, and passes any test written against a single-tenant
fixture.

**How the extension behaves.** `forTenant(id)` returns a client that merges the
filter into every operation on a scoped model. `tenantId` is merged *last*, so
a caller passing their own is overwritten rather than trusted. An operation the
extension does not recognise throws instead of passing through.

**Reads and writes need different treatment.** Filtering `where` stops a caller
reading across the boundary; it does not stop them *moving a row* across it.
`update({ where: { id }, data: { tenantId: someoneElse } })` satisfies the
filter — the row really is theirs — and then hands it away. So `tenantId` is
stripped from the payload of every `update`, `updateMany` and `upsert.update`.
Creates are not stripped, because there it is merged and overwrites whatever
was passed: the same guarantee reached from the other side.

No call site forwards a user-supplied `data` object, so this was never a live
hole. It is here because "a caller cannot widen its own scope" should be a
property of the mechanism, not a property of the current callers — and these
packages are meant to be built on.

**Child rows carry the column too.** `LedgerEntry`, `BalanceSnapshot`,
`TransitionLog`, `FulfillmentLine`, `WorkflowState` and `WorkflowTransition`
could each infer their tenant from a parent. They do not, because inheriting it
through a relation leaves the child table directly queryable with no filter:
`db.ledgerEntry.findMany()` returned every tenant's postings until a failing
ledger test caught it. That is a leak which looks like ordinary code in review.
Six columns of denormalisation is the price of the rule having no exceptions.

**Costs, honestly.**

- `systemPrisma` still exists, and must: sign-in has to find a user before any
  tenant is known, and the seed script writes across tenants. The guarantee is
  therefore "no accidental leak", not "no leak possible". The mitigation is
  that using it is a greppable, named act.
- Raw SQL bypasses the extension entirely. Any `$queryRaw` against a scoped
  table has to carry its own filter, and that is a review rule, not a
  mechanism.
- The scoped-model list is a literal in code. `tenant-scope.test.ts` parses the
  schema files and fails if the list and the schema disagree, so adding a model
  without deciding about isolation cannot pass CI. Note what that test does
  *not* catch: a model with no `tenantId` at all is consistent with the list
  and still unfiltered. That gap is why the leak above survived until an
  integration test found it, and why new child tables get the column by
  default rather than by argument.

**Three roles, not six.** `OWNER`, `OPERATOR`, `VIEWER` are capability tiers.
Job titles — packer, designer, proofreader — differ per merchant and change
without a deploy, so they belong in a workflow transition's `requiredRole`,
where they are configuration.

## An order is a document; fulfillment is the work

**Decision.** `Order` records what was agreed and does not move. `OrderLine` is
a line of that agreement. `Fulfillment` is a parcel's worth of work over some
of those lines, at one location, advancing through one workflow.
`FulfillmentLine` says how much of a line a fulfillment covers.

**Rejected: one row per product, with a status.** It is the shape of a
spreadsheet export, and it cannot express an order of three mugs and a print
where the print ships a week later from another site. A status column on such a
row is wrong about one of them by construction.

**`Order` has no status column.** An order's state is a question about its
fulfillments, and fulfillment state is configurable per tenant. A status enum
here would become a lie the first time two tenants ran different processes.
Lists that need "where is this order?" compute it from the fulfillments'
current states.

**Costs.** Four tables where one used to do. The order list needs a join or a
projection to answer "what state is this in", which is more work than reading a
column — paid for by never having to answer "which of these two statuses is
right?"

## Snapshots versus references

`Order.buyer` and `Order.shipTo` are JSON snapshots, not foreign keys to an
address table. `OrderLine` copies `sku` and `title` off the variant.

The reason is the same in both cases: an order is evidence of what was agreed.
If the address were a shared row, editing it would silently rewrite history on
an order that already shipped. Shapes are validated by Zod at the boundary, not
by Postgres.

The cost is real: no referential integrity on those fields, and a schema change
to the JSON shape needs a data migration rather than a column rename.

## Catalogue: two levels

`Product` is what a buyer recognises; `Variant` is what a warehouse picks and
what carries `sku` and price. Anything that looks like a third level is a
`Variant` option.

`Variant.options` is a flat JSON object rather than an option/value table. A
normalised option model earns its place when faceted search or per-option
inventory exists; until then it is three joins for a display string.

## What is deliberately absent

| Not here | Why |
|---|---|
| Bill of materials, vendors, purchase orders, expense categories | Manufacturing ERP. A different product with a different buyer. |
| Physical bin and slot assignment | Warehouse management. Meaningful only with a specific building's layout. |
| Support ticketing | Every merchant already has one, and it integrates better than it rebuilds. |
| A general `AuditLog` table | Lifecycle changes *are* `TransitionLog`; money changes *are* `LedgerEntry`. An audit row written beside a change can disagree with it; a change that is its own record cannot. |
| A `status` column on `Order` | An order's state is a question about its fulfillments, and fulfillment state is per-tenant configuration. A column here would be a lie the first time two tenants ran different processes. |
| ~~A `Session` table~~ | **Reversed.** The original reasoning — JWTs mean no database round trip — is sound for a single-tenant system and wrong here: the claim a token carries is "Ada is an OWNER of Northwind", and that can be revoked. See [auth.md](./auth.md). |
| A `RateLimit` table | Rate limiting belongs in middleware and a cache, not in the primary store. |

Each line is a scope judgement, and each is reversible. None of them is missing
by accident.

## Indexes

Every index is a tax on writes, so each one names the query it serves in a
comment beside it. `Order` has three: `(tenantId, placedAt)` for the list view
and its date filters, `(tenantId, externalRef)` for import reconciliation, and
the `(tenantId, number)` unique. A fourth needs an `EXPLAIN` in the pull
request that adds it.
