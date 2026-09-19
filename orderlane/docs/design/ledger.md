# Ledger

## The problem

A fulfillment platform holds other people's money: a merchant funds a balance,
work is charged against it, refunds go back. The obvious model is a `balance`
column updated on each event.

It has one failure mode that never goes away. The column and the events that
produced it are two sources of truth, and the first partially-applied write
puts them out of step — silently, permanently. From then on "the balance is
wrong" is a mystery to be settled by a manual correction, and the correction
itself leaves no trace of what it was correcting.

## The decision

Double entry. Three tables:

```
LedgerAccount     a bucket money can be in       (no balance column)
LedgerTransaction one economic event             (unique idempotencyKey)
LedgerEntry       one side of one posting        (immutable)
```

One invariant, and everything follows from it:

> Every transaction's debits equal its credits.

Checked by `assertBalanced()` inside the same database transaction that writes
the entries, so an unbalanced posting cannot be committed even by a caller who
builds one.

### Accounts and normal sides

| Account | Normal side | Why |
|---|---|---|
| `TENANT_WALLET` | CREDIT | From the platform's side of the books, a merchant's deposited funds are money owed back to them — a liability. |
| `TENANT_RECEIVABLE` | DEBIT | What a merchant owes for work already done — an asset. |
| `PLATFORM_REVENUE` | CREDIT | Income. |
| `PLATFORM_CLEARING` | CREDIT | Money in flight: charged, not yet recognised. |

Getting a normal side backwards is *the* classic double-entry mistake, so
`NORMAL_SIDE` is a frozen table rather than a convention to remember.

### Amounts

Amounts are positive; `direction` carries the sign. A posting with a negative
amount is rejected — allowing both would give two ways to express one movement
and guarantee that some query eventually counts it twice.

Money is an integer count of minor units plus an explicit currency. Floats
cannot represent 0.1, so any system that adds prices as floats is one long
enough invoice away from being a cent out. A decimal type fixes that but
invites two numeric representations across the wire, the database and the UI.
Integers of minor units are exact and JSON-safe, and the unit ambiguity is
removed by never naming a money field without the `Minor` suffix.

`LedgerEntry.amountMinor` is `BigInt`, not `Int`: 2^31 minor units is about
21 million dollars, which is a plausible lifetime turnover and therefore not a
safe ceiling for an account's building block. Line-level prices stay `Int`.

### Idempotency

`LedgerTransaction.idempotencyKey` is required and unique. Not optional — every
caller names the event it is recording (`"order:clx123:charge"`), so a retried
request is rejected by the database rather than posted twice.

An application-level "has this been charged yet?" check races with its own
retry. The unique constraint does not.

### Corrections

A mistake is corrected by posting a reversing transaction. Never by editing an
entry, never by deleting one. `reverse()` builds the opposite postings; the
original stays visible, which is the only version of the story that survives
somebody asking about it a year later.

### Reading a balance

```
balance = snapshot.amount + sum(entries after snapshot.throughSeq)
```

`throughSeq`, not an id. `LedgerEntry.seq` is a `bigserial`, because the ids
here are cuids: a cuid carries a timestamp prefix and is *roughly* ordered,
which is not the same as ordered. Two processes inserting in the same
millisecond can produce ids whose sort order disagrees with the order they were
written, and "every entry after this one" has to be exact or the balance is
silently wrong.

`BalanceSnapshot` is a cache. With no snapshot the balance is the sum of every
entry, which is also the definition — the snapshot changes how long the answer
takes, never what it is. Dropping every row in that table changes no number.
That property is what makes the cache safe, and it is asserted in a test rather
than assumed.

### References are not foreign keys

`LedgerTransaction.reference` is a string like `"order:clx123"`, not an FK. The
ledger has to outlive anything it refers to, and a cascade delete must never be
able to reach money.

## What this replaces

The design this project grew out of had a wallet balance, a top-up request, an
uploaded bank-transfer screenshot and an admin approval step. That is one
company's cash collection process, not a money model. Here, "a merchant funded
their balance" is one `WALLET_FUNDING` transaction; how the funds arrived —
card, transfer, manual credit — is a payment integration's problem and does not
reach into the books.

## Costs

- **More rows.** Two entries and a transaction per event, where a column update
  was one write. At the volumes this system is designed for that is nothing;
  at very high volume it would need partitioning by period.
- **Double entry has to be learned.** A contributor who has not met it will
  reach for `account.balance += amount`. The `NORMAL_SIDE` table and the tests
  are the defence.
- **Reporting needs care.** "Revenue this month" is a query over entries with a
  date range and an account filter, not a `SUM(orders.revenue)`.
- **Snapshots need maintenance.** Nothing breaks if they go stale, but reads
  get slower, so something has to advance them. `refreshSnapshot()` does it and
  is safe to run twice; what is not yet written is the schedule that calls it.

## How it is tested

`packages/core/src/ledger/balance.test.ts`, 12 pure tests, plus 11 integration
tests in `packages/services/src/ledger/ledger.test.ts` against a real database:

- balanced postings pass; unbalanced ones are rejected and report the delta
- negative and zero amounts are rejected; a one-sided posting is rejected even
  when it sums to zero
- a missing idempotency key is rejected
- every problem in a bad draft is reported in one pass
- a reversal nets the account back to exactly zero
- normal sides are exercised in both directions: funding a wallet increases it,
  spending decreases it, a receivable behaves oppositely
- a snapshot and a from-scratch projection agree, over 50 entries, and
  refreshing twice does not double-count
- an entry from the wrong account raises rather than silently contributing zero
- **property test**: 500 randomly generated balanced transactions, from a fixed
  seed, all validate clean and sum to zero in aggregate — per transaction *and*
  across the whole set

The integration half covers what purity cannot: that two simultaneous charges
for the same order post once, that a rejected posting leaves no rows at all,
that deleting every snapshot changes no balance, and that an idempotency key
belonging to another tenant is a conflict rather than a silent no-op.
