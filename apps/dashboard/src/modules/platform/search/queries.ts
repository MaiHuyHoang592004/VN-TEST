import "server-only";

import { enforceRateLimit, RATE_LIMITS } from "@gwprint/db";

import { requireUser } from "../../core/guard.ts";
import { MIN_QUERY_LENGTH, searchFor, type SearchHit } from "./service.ts";

export type { SearchHit };

/**
 * ⌘K, for the signed-in viewer.
 *
 * Signed-in is all this asks for: which ROWS come back is the scope's job, and
 * each group inside searchFor checks its own grant. A permission here would
 * either lock people out of their own data or be the wrong question.
 */
export async function search(query: string, limit = 10): Promise<SearchHit[]> {
  const actor = await requireUser();
  // Cheap check before the expensive one: a one-character query would scan
  // every order, variant and user to return five arbitrary rows.
  if (query.trim().length < MIN_QUERY_LENGTH) return [];
  // Per USER, not per IP: colleagues share an office IP, and one of them
  // holding down a key should not lock the others out. Fails open (see
  // consumeRateLimit) — a limiter that takes search down when Postgres
  // hiccups is the wrong trade.
  await enforceRateLimit(`search:${actor.id}`, RATE_LIMITS.search);
  return searchFor(actor, query, limit);
}
