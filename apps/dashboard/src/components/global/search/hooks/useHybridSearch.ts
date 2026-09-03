/**
 * useHybridSearch — debounced server search.
 *
 * It used to be genuinely hybrid: download the whole index once, then filter
 * it client-side with Fuse. That worked because the index was a static demo
 * dataset. With real data (doc 07 D2) it cannot:
 *
 *   · a FULL index means shipping every order, SKU and user the caller may see
 *     to their browser — the search box would become a bulk export;
 *   · a PARTIAL index is worse, because the hook preferred client results
 *     whenever it had any, so anything outside the downloaded slice would
 *     silently stop being findable.
 *
 * So the index and the fuzzy fallback are gone, along with /api/search/all.
 * The server does the matching inside the caller's scope, debounced. Typo
 * tolerance is the thing that was lost; bring it back in Postgres
 * (pg_trgm/similarity) rather than by shipping rows to the client.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import type { SearchResult } from "../types";

export type { SearchResult };

interface SearchApiResponse {
  results: SearchResult[];
  meta: {
    query: string;
    count: number;
    took: number;
    total?: number;
    error?: string;
  };
}

interface UseHybridSearchOptions {
  /** Minimum query length to trigger search (default: 1) */
  minLength?: number;
  /** Maximum results to return (default: 10) */
  limit?: number;
  /** Debounce delay for server search in ms (default: 250) */
  debounceMs?: number;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

async function fetchServerSearch(
  query: string,
  limit: number,
): Promise<SearchApiResponse> {
  const response = await fetch(
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);
  return response.json();
}

export function useHybridSearch(
  searchQuery: string,
  options: UseHybridSearchOptions = {},
) {
  const { minLength = 1, limit = 10, debounceMs = 250 } = options;

  const debouncedQuery = useDebouncedValue(searchQuery, debounceMs);
  const isTyping = searchQuery !== debouncedQuery;

  const serverSearchQuery = useQuery({
    queryKey: ["serverSearch", debouncedQuery, limit],
    queryFn: () => fetchServerSearch(debouncedQuery, limit),
    enabled: debouncedQuery.trim().length >= minLength,
    // Short, and per query: results are scoped rows that can change under the
    // user, not a static catalogue.
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const results =
    searchQuery.trim().length < minLength ? [] : (serverSearchQuery.data?.results ?? []);

  return {
    /** Search results */
    results,
    /** True while debouncing or fetching */
    isLoading: isTyping || serverSearchQuery.isLoading,
    /** Kept for the callers that branch on it — always false now. */
    isClientMode: false,
    isBackgroundLoading: false,
    isError: serverSearchQuery.isError,
    error: serverSearchQuery.error,
    totalItems: results.length,
  };
}
