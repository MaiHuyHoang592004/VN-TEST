# Import pipeline

## The problem

Merchants arrive with a spreadsheet. It is their working file: hand-edited,
inconsistently formatted, and re-sent whenever something changes. Three things
have to be true of importing it.

1. One bad row must not sink the batch. A file of 500 orders with one missing
   SKU should import 499 and explain the one.
2. Re-uploading must not duplicate. Merchants fix a cell and send the whole
   file again, every time.
3. The operator must know what will happen **before** it happens. A bulk import
   is the single most destructive button in the product.

The third is the one usually missing, and it is why the first two matter less
than they should: without a preview, "499 imported, 1 failed" is discovered
after the fact.

## The decision

Two phases, with the file staged in between.

```
upload
  → ImportJob(PARSING)
  → ImportRow[]        raw JSON, validated, hashed — nothing in domain tables
  → PREVIEW            "will create 12, update 3, skip 480, reject 5, because…"
  → COMMIT             apply only what the operator confirmed
```

Nothing reaches a domain table before COMMIT. The staging rows keep the raw
input verbatim, so a disagreement about what the file said can be settled
without the file.

### One adapter per entity kind

```ts
interface ImportAdapter<T> {
  kind: string;
  columns: readonly string[];
  parse(raw, lineNumber): ParsedRow<T>;   // never throws: a bad row is data
  identityOf(values: T): string | null;   // decides CREATE vs UPDATE
  hashFields: readonly string[];          // which fields are the row's meaning
}
```

Orders, catalogue and stock differ only in this object. Staging, hashing,
planning, previewing and committing are shared.

`parse` never throws. A malformed row is an outcome, not an exception — the
moment parsing can throw, one bad cell takes the batch with it.

### Identity is content, not position

`rowHash` is SHA-256 over the row's *parsed business fields*, canonicalised:

- keys sorted, so column order in the file is irrelevant
- strings NFC-normalised (`é` typed on a Mac and `é` pasted from Windows are
  one letter to a human and two byte sequences to a hash)
- trimmed, internal whitespace collapsed
- empty string becomes null, because an empty cell and a cell of spaces mean
  the same thing
- each value tagged with its type, so a SKU of `"1"` and a quantity of `1` do
  not collide

The line number is deliberately **not** in the hash. Hashing the raw line, or
including its position, makes inserting one row near the top look like a file
of entirely new rows. Hashing meaning means a corrected file updates exactly
the rows that changed.

Case is deliberately *not* folded during canonicalisation. Whether `ABC-1` and
`abc-1` are the same SKU is the adapter's decision, made while parsing, and it
is then visible in the staged values rather than hidden inside a hash.

### Two kinds of duplicate

`planImport()` distinguishes them, because they need different handling:

- **Already applied by an earlier job** — `@@unique([tenantId, kind, rowHash])`
  has it. Normal, expected, a no-op.
- **The same row twice inside one file** — caught in the planner. If it were
  left to the database, the second insert would fail at commit time and take
  the surrounding transaction with it.

### The preview and the commit are one computation

`planImport()` is a pure function from staged rows to a plan. The preview
screen renders its output; the commit step consumes it. The number an operator
is shown and the work actually performed cannot disagree, because they are the
same function run twice.

### Idempotency lives in the database

`@@unique([tenantId, kind, rowHash])` is what actually enforces "importing the
same row twice creates one record". The planner's check is a courtesy that
produces a good error message; the constraint is the guarantee. An
application-level check races with its own retry.

`ImportJob.fileChecksum` answers a different question — "this is byte-for-byte
the file you uploaded an hour ago" — and is reported rather than blocked.

## Commit semantics

One transaction per row, not one per batch.

A batch-wide transaction means row 500 failing rolls back 499 successes, which
is precisely the behaviour the staging phase exists to avoid. Per-row means a
commit can be resumed after a crash: rows already `APPLIED` are skipped by
their hash.

The cost: a partially committed job is a real state, and the UI has to show it
honestly ("312 of 500 applied") rather than pretending the job is atomic.

## Costs

- **Two extra tables** and a two-step flow where one endpoint would do.
- **Staged rows accumulate.** A retention job is needed and is not yet written.
- **The preview can go stale.** Between preview and commit, another user can
  change the catalogue, so a row previewed as UPDATE may commit as CREATE. The
  commit re-resolves rather than trusting the plan's action, and the preview is
  honest that it is a forecast.
- **`hashFields` is a judgement call per adapter.** Include too little and
  genuinely different rows collide; too much and a cosmetic edit looks like new
  work. It is chosen per adapter and covered by that adapter's tests.

## How it is tested

`packages/core/src/import/plan.test.ts`, 11 tests, against a stand-in adapter —
the framework is what is under test, not any one entity kind:

- a row's hash survives having lines inserted above it
- field order in the source file does not change the hash
- whitespace, NFC and empty-cell differences normalise away; a real value
  change does not
- `"1"` and `1` hash differently
- one invalid row among three leaves the other two importable, and explains
  itself per field
- a row applied by an earlier job is SKIPPED, not duplicated
- the same row twice in one file is caught by the planner
- an existing business key plans UPDATE, a new one CREATE
- **the round trip**: import three rows, change one value, re-upload the whole
  file — two SKIPPED, one UPDATE, nothing created
- planning the same input twice gives the same plan
