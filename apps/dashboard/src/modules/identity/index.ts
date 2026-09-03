/**
 * identity — who someone is and what they may do: profiles, user
 * administration, invitations, API keys.
 *
 * THIS FILE IS THE DOMAIN'S PUBLIC SURFACE. Other domains import from
 * `@/modules/identity` and nothing deeper; the ESLint boundary rule enforces
 * it. Inside the domain, import files directly.
 *
 * Export only what another domain legitimately needs. If an export exists
 * solely for one caller in another domain, that logic probably belongs in
 * `core` or in this domain to begin with.
 */

// Read-side helpers other domains may need (e.g. rendering an assignee).
export { getUser } from "./users/service.ts";

// API-key verification — used by the public API transport when it authenticates
// a request on behalf of any domain.
export { verifyApiKey, hashKey } from "./api-keys/service.ts";
