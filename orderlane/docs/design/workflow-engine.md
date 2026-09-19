# Workflow engine

## The problem

Every fulfillment operation has a lifecycle, and no two have the same one. A
shop shipping stock on hand picks, packs and dispatches. A shop making things
to order proofs the artwork, waits for the buyer, produces, checks quality, and
sometimes goes back a step — twice.

The usual answer is an enum:

```
PENDING → ASSIGNED → IN_PRODUCTION → FULFILLED → SHIPPED → DELIVERED
```

That enum is a drawing of one company's floor. Onboarding a second merchant
means either bending their process to fit it or adding states nobody else uses,
and the enum grows until no one can say which values are live. Worse, it is
*ordered*: it cannot express "the buyer asked for changes, go back to
proofing", because going back is not a direction an ordered list has.

## The decision

A process is data. A tenant owns one or more `WorkflowDefinition`s, each a set
of `WorkflowState`s and `WorkflowTransition`s. A `WorkflowInstance` is one
running process, and a `Fulfillment` points at one.

The engine that moves instances around is in `@orderlane/core/workflow`. It has
no dependencies, touches no database, and does not know what an order is.

```ts
const workflow = new Workflow(definition);

// What may this person do right now?
workflow.available(currentStateKey, actor, { facts });

// May they do this one? Returns a decision; changes nothing.
workflow.attempt(currentStateKey, transitionKey, actor, { facts });
```

`attempt` returns `{ ok: true, from, to, transition }` or
`{ ok: false, error }`. Persisting the outcome — the new state, the log entry,
the version bump — is the caller's job, in one database transaction.

### Guards are data

A transition carries guards as JSON:

```json
[{ "kind": "count_is_zero", "count": "lines_missing_artwork" }]
```

Each `kind` resolves through a registry of pure functions. The built-in
vocabulary is deliberately domain-free — `flag_is_true`, `flag_is_false`,
`count_at_least`, `count_is_zero` — and the host supplies the facts:

```ts
interface SubjectFacts {
  flags: Record<string, boolean>;
  counts: Record<string, number>;
}
```

"Every line has artwork" is therefore not a branch in this package. It is a
fact name in configuration plus a host that knows how to compute it. That seam
is what keeps one merchant's rules out of everyone's code, and it is why the
engine can be tested in microseconds with no fixtures.

A guard `kind` with no registered function **denies** the transition. The
opposite default would let a typo in configuration silently remove a check.

Every guard runs, even after one fails. An operator two steps from being able
to proceed is told both steps at once.

### Definitions are validated before they are saved

`validateDefinition()` reports:

- exactly one `INITIAL` state, at least one `TERMINAL`
- no duplicate state or transition keys, no references to missing states
- nothing leaves a `TERMINAL` state, nothing transitions to itself
- every state is reachable from `INITIAL`
- **every non-terminal state has a path to some `TERMINAL` state**

The last check is the one that earns its keep. A state work can enter and never
leave is invisible on a diagram and obvious to a graph search, and it is only
discovered otherwise by finding a week-old order stuck in it.

### Versions are immutable

Editing a live definition would rewrite the meaning of history: a log entry
saying "moved to Packed" has to keep meaning what it meant when written. So a
definition is `(key, version)`, editing publishes `version + 1`, and running
instances finish on the version they started on.

### Concurrency

`WorkflowInstance.version` is an optimistic lock. Two operators pressing "Mark
packed" at once must not both succeed. The update matches on the version it
read and increments it; the loser updates zero rows and is told to reload,
rather than writing a second log entry for a move that happened once.

## What this makes possible

The shipped `made-to-order` preset contains two cycles: `awaiting_approval →
proofing` when a buyer asks for changes, and `quality_check → in_production`
when work fails a check. Both are ordinary edges. Neither can exist in an
ordered status column without lying about what the order's state means.

`available()` is also what the UI renders. A visible button is a button that
works, because the affordance and the permission check are one computation
rather than two that drift.

## Costs

- **A join to read a status.** "What state is this order in?" is no longer a
  column. Lists denormalise the current state key for display, and that
  denormalisation must be written in the same transaction as the transition.
- **Configuration can be wrong.** An enum cannot be misconfigured; a definition
  can. `validateDefinition()` is the answer, and it has to stay ahead of the
  ways people invent to build a bad graph.
- **Reporting across tenants is harder.** "How many orders are in production?"
  spans different state keys per tenant. A tag or category on states would fix
  it; it is not built, because no report needs it yet.
- **It is more code than an enum.** About 300 lines and 17 tests, against one
  line of Prisma. Worth it at two processes, not worth it at one — and this
  project has two in its seed data because a workflow engine with one workflow
  is a hypothesis, not a design.

## How it is tested

`packages/core/src/workflow/*.test.ts`, 17 tests, no database:

- both shipped presets validate clean
- guards pass, fail, report every failure, and deny on an unknown kind
- role below the minimum is refused; a higher role satisfies a lower bar
- a transition from the wrong source state, and any transition out of a
  terminal state, are refused
- `available()` returns exactly what the actor may do, and a blocked guard
  removes the affordance
- an eleven-step run of `made-to-order` traverses both cycles and lands in a
  terminal state
- the same call made twice returns the same value — the engine is pure

The validator is tested against deliberately broken definitions: an orphan
state, a trap state with no exit, two initial states, a transition escaping a
terminal.
