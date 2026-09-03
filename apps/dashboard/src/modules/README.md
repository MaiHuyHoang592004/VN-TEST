# modules/ — how the server code is organised

Built to stay navigable at 200+ endpoints. Two ideas do the work:
**co-location** (everything one feature owns lives in one folder) and
**bounded contexts** (features group into a handful of domains with an
enforced import rule).

## Layout

```
modules/
  core/                     cross-cutting infrastructure — anyone may import
    guard.ts                requireUser / requirePermission (the choke point)
    session.ts              session → SessionUser
    context.ts              audit context (actor + ip + user agent)
    schema.ts               shared zod primitives (money, phone, reason…)

  <domain>/                 a bounded context
    index.ts                the domain's PUBLIC surface
    <feature>/
      service.ts            logic. Takes an explicit `actor`; never reads
                            cookies or headers, so every transport reuses it.
      queries.ts            guarded reads for server components
      actions.ts            "use server" adapters (guard → service → revalidate)
      routes.ts             HTTP routes for /api/v1 (added when Hono lands)
      schema.ts             zod. Isomorphic — the form imports the SAME schema,
                            so a field can't be editable in the UI yet dropped
                            on save.
      <feature>.test.ts     next to its subject
```

Domains: `identity`, `catalog`, `fulfillment`, `inventory`, `finance`,
`support`, `platform`. They mirror the business, not the tech stack, and they
came from the four systems mapped out of the legacy app.

## The import rule (enforced by ESLint, not by good intentions)

```
core        ← anyone may import
domain      → its own files + core + libs/*
domain A    → domain B ONLY through B/index.ts
core        → never imports a domain
```

If two domains need the same thing, it belongs to neither — put it in `core`
or `libs/db`. A violating import fails `npm run lint`, and therefore CI.

Why bother: forty folders that may all import each other is a mesh, and a mesh
is what makes a large codebase impossible to change. The boundary is the whole
point; the folders are just where it shows up.

## Conventions

- Folder = the resource, **plural** (`orders/`, `warehouses/`). `profile/` is
  singular because it's "mine", not a collection.
- File = the layer, always the same names. You should never have to search for
  where a thing lives.
- No `utils.ts` — it becomes a junk drawer. Name the thing (`pricing.ts`).
- `server-only` goes on the boundary files (`queries.ts`, `core/guard.ts`,
  `core/session.ts`, `core/context.ts`); `actions.ts` carries `"use server"`.
  Internal `service.ts` files stay importable by `node --test`, which is what
  keeps the money rules directly testable.

## Adding a feature

1. `modules/<domain>/<feature>/` with `schema.ts` + `service.ts`.
2. `queries.ts` / `actions.ts` for the web.
3. `routes.ts` in the same commit — the endpoint ships WITH the feature, so
   there is never an "API phase" left to do for mobile.
4. Export from the domain `index.ts` only if another domain genuinely needs it.

## Why routes never become 200 folders

Once the API moves to Hono (planned at ~20 endpoints), `app/api/v1/[[...route]]`
is a single file that mounts each domain's router. 200 endpoints become ~5–8
route definitions per feature folder, sitting beside the service they call —
instead of 200 nested `route.ts` directories.
