/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * The ⌘K endpoint. Same response contract the UI has always spoken; the demo
 * dataset behind it is gone (doc 07 D2) and every column now comes from Prisma
 * through the caller's own scope.
 */
import { NextRequest, NextResponse } from "next/server";

import { search } from "@/modules/platform/search/queries";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit")) || 10, 1),
    25,
  );

  const results = await search(q, limit);

  return NextResponse.json({
    results,
    meta: {
      query: q,
      count: results.length,
      took: Math.round(performance.now() - started),
    },
  });
}
