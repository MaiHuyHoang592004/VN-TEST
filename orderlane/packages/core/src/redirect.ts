/**
 * Validating a redirect target that came from a request.
 *
 * A sign-in page that forwards to a caller-supplied path is the classic open
 * redirect: the link carries the real domain and the real certificate, so it
 * survives inspection, and it lands the victim on somebody else's page.
 *
 * The rule that looks obvious — "starts with / but not //" — is wrong, and
 * wrong in a way that is invisible on inspection:
 *
 *     /^\/(?!\/)/.test("/\\evil.example/phish")   // true
 *     new URL("/\\evil.example/phish", origin)     // https://evil.example/phish
 *
 * Under WHATWG URL parsing a backslash is equivalent to a slash in a special
 * scheme, so `/\` opens an authority exactly as `//` does. Every browser
 * implements this; it has been the standard bypass for such filters for years.
 *
 * So the check does not pattern-match. It asks the URL parser the same
 * question the browser will ask, against an origin that cannot be reached, and
 * accepts the answer only if nothing moved.
 */

/** Not routable, not resolvable, and impossible to reach — so "still here" is unambiguous. */
const SENTINEL_ORIGIN = "https://redirect-guard.invalid";

export const DEFAULT_REDIRECT = "/";

/**
 * A same-origin path, or `DEFAULT_REDIRECT`.
 *
 * Rejects by construction: `//evil.example`, `/\evil.example`, `/%5Cevil.example`,
 * `https://evil.example`, `javascript:…`, and anything the parser refuses.
 * Preserves the query string and fragment, which a returning user's link needs.
 */
export function safeRedirectPath(raw: unknown, fallback: string = DEFAULT_REDIRECT): string {
  if (typeof raw !== "string" || raw === "") return fallback;

  // A control character cannot appear in a path that a browser will honour,
  // and `\r\n` in particular is header injection if anything downstream is
  // less careful than Node's setHeader.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(raw, SENTINEL_ORIGIN);
  } catch {
    return fallback;
  }

  // If the origin moved, the input named somewhere else — whatever spelling it
  // used to get there.
  if (resolved.origin !== SENTINEL_ORIGIN) return fallback;

  // A path-relative input ("orders/1") resolves against the sentinel and keeps
  // its origin, but it is not what a caller of this function means by a
  // redirect target. Require it to be rooted.
  if (!raw.startsWith("/")) return fallback;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
