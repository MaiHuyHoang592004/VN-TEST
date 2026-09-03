"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { SortState } from "./data-table.tsx";

/**
 * Table state (page, size, sort, filters) kept in the URL rather than React
 * state.
 *
 * Why the URL: a filtered list stays linkable and shareable, the back button
 * does what a user expects, and the page can server-render exactly the rows
 * asked for instead of fetching after mount. It also means the page component
 * reads its own params — no prop-drilling of query state.
 *
 * Navigation runs in a transition so the current rows stay on screen (and
 * `pending` can dim them) instead of flashing a skeleton on every keystroke.
 */
export function useTableParams(defaults: { pageSize?: number } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Number(params.get("size") ?? defaults.pageSize ?? 25);
  const sortId = params.get("sort");
  const sort: SortState = sortId
    ? { id: sortId, desc: params.get("dir") === "desc" }
    : null;

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  return {
    page,
    pageSize,
    sort,
    pending,
    /** Read an arbitrary filter value. */
    get: (key: string) => params.get(key) ?? "",

    setPage: (p: number) => push((n) => n.set("page", String(p))),

    setPageSize: (s: number) =>
      push((n) => {
        n.set("size", String(s));
        n.delete("page"); // a bigger page makes the old page number meaningless
      }),

    setSort: (s: SortState) =>
      push((n) => {
        if (!s) {
          n.delete("sort");
          n.delete("dir");
        } else {
          n.set("sort", s.id);
          n.set("dir", s.desc ? "desc" : "asc");
        }
        n.delete("page");
      }),

    /** Set or clear one filter. Always returns to page 1 — staying on page 7
     * of a newly-filtered list usually lands on an empty page. */
    setFilter: (key: string, value: string) =>
      push((n) => {
        if (value) n.set(key, value);
        else n.delete(key);
        n.delete("page");
      }),

    clearFilters: (keys: string[]) =>
      push((n) => {
        keys.forEach((k) => n.delete(k));
        n.delete("page");
      }),
  };
}
