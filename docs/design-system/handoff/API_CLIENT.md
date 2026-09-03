# API client — `packages/api`

The one place the FE touches the network. Endpoints per screen: `BE_ALIGNMENT.md` §3.
Payload shapes: `types/domain.d.ts`. Known backend risk: `BACKEND_GAPS.md`.

## 1 · The client

`packages/api/src/client.ts` — a thin `fetch` wrapper, no axios:

```ts
const BASE = import.meta.env.VITE_API_BASE_URL;

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const token = getToken();                      // AUTH_AND_ROLES.md
  const res = await fetch(BASE + path, {
    ...init,
    method: init?.json ? (init.method ?? "POST") : (init?.method ?? "GET"),
    headers: {
      ...(init?.json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
      ...init?.headers,
    },
    body: init?.json ? JSON.stringify(init.json) : init?.body,
  });
  if (res.status === 401) { onUnauthorized(); throw new ApiError(401, "unauthenticated"); }
  if (!res.ok) throw await ApiError.from(res);
  return res.status === 204 ? (undefined as T) : res.json();
}
```

Rules: **no `/admin/v1/*` calls** (x-api-key integration surface, `BE_ALIGNMENT.md` §4).
No request interceptor that retries blindly — see §5. No client-side data synthesis.

## 2 · List requests — one convention

Every list screen sends the same shape (the source FE's TanStack-table contract, kept):

```ts
type ListParams = {
  search?: string;
  columnFilters?: { id: string; value: unknown }[];
  sorting?: { id: string; desc: boolean }[];
  pageIndex: number;   // 0-based
  pageSize: number;
};
```

Response: `Paginated<T> = { data: T[]; meta: { total; pageIndex; pageSize } }`.

**Normalize at the client boundary, not in screens.** Two known variants:
- `/api/users` (recipients list, `AdminNotifications`) returns `meta { total, page, totalPages }`
  and is called with a hard-coded `columnFilters:[{id:"role",value:"customer"}]`, sort `id` asc,
  `pageSize 12`.
- Anything under `billing` uses **server-defined buckets** — never re-bucket client-side.

Wrap both in `toPaginated()` so `DataTable` and `Pagination` only ever see one shape.

**Page size options are per-screen, from the design**, not global: seller Orders
`[25,50,100,200,500]`, admin Orders `[10,25,50,100]`, Wallet fixed 12, recipients fixed 12.
Full-density tables cap at 12 rows/page regardless of the selection (both Orders screens).

Filter state lives in the URL (both Orders screens already encode `tab q st sh lb sk sd d n p from to cols`
into the hash) — keep URL as the source of truth so a query key is derivable from the URL alone.

## 3 · Query keys & invalidation

```ts
["orders", "list", appliedParams]      // appliedParams = the APPLIED filter object, not drafts
["orders", "detail", id]
["tickets", "list", params] / ["tickets", "detail", id]
["dashboard", "overview", range]
```

Toolbars are **draft → Apply**: the query key changes only on Apply (see the golden path).
After a mutation invalidate the narrowest prefix that can have changed — `["orders"]` after
a status write, `["tickets","detail",id]` after a reply.

Defaults: `staleTime 30_000`, `retry 1`, `refetchOnWindowFocus false`.
Only the two Orders screens poll, and only rows the metadata marks `loading:true`.

## 4 · Errors

`ApiError { status, code?, message }`. Screen behaviour per `STATES.md`:

| Status | UI |
|---|---|
| 401 | log out → `/auth` (no toast) |
| 403 | the no-permission state, not an error toast |
| 404 (detail route) | `/error/404` |
| 422 / 400 | field errors mapped back into the react-hook-form field; never a bare toast |
| 5xx / network | `Callout tone="critical"` + Retry (list), `Toast` (mutation) |

Never render a raw server message as the primary copy — use the screen's documented
copy and keep the server detail secondary.

## 5 · Hazards the client must wrap (from `BACKEND_GAPS.md` + `BE_ALIGNMENT.md` §4)

1. **Charts are not zero-filled.** `dashboard/overview` and `billing/overview.charts` group
   raw rows only. Do **not** zero-fill to fake a slope. Missing day = gap; `ChartFrame` renders
   the sparse series and says the range is partial.
2. **Scan mutates on GET.** `/api/orders/fulfillment-scan-by-id/:id` changes state. Therefore:
   `retry: 0`, no `prefetchQuery`, no `refetchOnMount`, no `refetchOnWindowFocus`, never in a
   `useEffect` that can run twice. Model it as a **mutation**, not a query, despite the verb.
3. **`tracking_status`** uses the normalized set from `BE_ALIGNMENT.md` — no other strings.
4. **V3 repricing** can change a price between read and write; a screen showing a price must
   re-read before it writes, and never cache a price into a form default across a reload.
5. **Statuses the FE shows but the BE never writes** (`BACKEND_GAPS.md` §C) stay display-only —
   no action button may claim to set them.
6. **Missing endpoint / field** → render the documented placeholder and add a line to
   `BACKEND_ASKS.md`. Never a mock, never a plausible default.
