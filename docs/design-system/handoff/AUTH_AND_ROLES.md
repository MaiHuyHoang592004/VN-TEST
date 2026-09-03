# Auth & roles

Screens: `ui_kits/system/SystemAuth.html` (branded, `/auth/*`),
`SystemAuthClassic.html` (`/classic/*`), `SystemErrors.html` (`/error/403|404|500`).

## 1 · Sign in

`POST /api/users/login` → bearer token. Store in `localStorage["gwp.token"]`.
`Remember me` persists **only the email** to `localStorage["gwp.email"]` (source behaviour).

`loginSchema` (zod, verbatim from source): `email` valid + 3–50 chars, `password` 3–50, both
required, submit on Enter, and exactly one neutral error line — **"Invalid email or password"**
— never a field-specific "wrong password". `signupSchema`: email + password + confirm (must
match) + accept terms.

## 2 · Session

`AuthProvider` holds `{ token, currentUser, roles, login, logout }`; `currentUser` is fetched
once after login and on boot when a token exists. **The FE decides nothing about roles** — it
reads `currentUser.roles` exactly as the source FE's `AppRoutingSetup` does.

**No refresh flow.** 401 anywhere → clear storage, drop the query cache, redirect to `/auth`
with `?next=`. Whether the backend has a refresh endpoint and a token TTL is **unconfirmed →
`BACKEND_ASKS.md` §7.1/§7.2**; do not build a refresh loop on a guess.

## 3 · Role vocabulary — the only 8 values

`admin` · `supporter` · `warehouse` · `warehouse_admin` · `warehouse_external` ·
`designer` · `customer` · `public`

Never invent a role, never derive one from an email domain, never collapse
`warehouse`/`warehouse_admin`/`warehouse_external` — they gate different routes
(`handoff/routes.json`).

## 4 · Front door per role

| Role | App | Landing |
|---|---|---|
| `customer` | seller | `/` (SellerDashboard) |
| `admin` | admin | `/` (AdminDashboard) |
| `supporter` | admin | `/orders` |
| `warehouse`, `warehouse_admin` | admin | `/fulfillment` |
| `warehouse_external` | admin | `/fulfillment-new` (its only route) |
| `designer` | admin | `/orders` (OrderModal is its only listed surface) |
| `public` | public | marketing |

A user who authenticates into the wrong app is redirected to their own app's origin —
not shown an empty shell. Multi-role users take the first match in the order above.

## 5 · Guards

`<RequireAuth>` (token or → `/auth?next=`) wraps everything but `/auth/*` and `/error/*`.
`<RequireRole roles={[…]}>` reads the route's `roles` array **straight from
`handoff/routes.json`** — no hand-written duplicate list. A role mismatch renders the
no-permission state from `STATES.md` (or `/error/403` for a direct URL hit), never a blank page.

Nav is filtered by the same array: a tab the role can't open is not rendered.
`TopNav` dropdown parents (Products ▾, Inventory ▾, System ▾) hide when every child is gated out.

Feature flags in `routes.json` (`HIDE_V3_PRODUCTS`) gate routes **and** their nav entries together.

## 6 · Logout

Clear `gwp.token`, `queryClient.clear()`, keep `gwp.email`, redirect `/auth`. Never leave a
stale `currentUser` in memory behind a route guard.
