import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@orderlane/core/auth";

/**
 * A cheap first gate on tenant routes.
 *
 * It checks only that a session cookie is PRESENT — middleware runs before the
 * page and should not be doing database work on every request, and a forged
 * cookie value gets no further than the real check. That real check is
 * `currentContext`, which resolves the session and the membership; this only
 * saves an obviously-signed-out visitor a round trip and sends them somewhere
 * useful.
 *
 * Worth being explicit about, because middleware that *looks* like an
 * authorisation boundary is worse than none: somebody will eventually trust it.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const signIn = new URL("/signin", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/t/:path*"],
};
