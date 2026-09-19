# Authentication

## A decision reversed

An earlier version of [domain-model.md](./domain-model.md) said this project
had no `Session` table, because sessions were JWTs and no request should need a
database round trip to authenticate. That was wrong, and the reason is specific
to this product.

In a single-tenant application the claim a token carries is "this is Ada", and
that claim does not change. Here it is "**Ada is an OWNER of Northwind**", and
that one can be taken away. A JWT carrying it stays true until it expires — so
removing somebody's access would mean waiting out their token, or maintaining a
revocation list, which is a session table with extra steps and a worse name.

So: sessions are rows. The cost is one indexed lookup per request. The benefit
is that "remove this person" takes effect on their next click, which is what
everybody assumes it already does.

The earlier reasoning was not silly — it was a good argument applied to the
wrong system. It is recorded here rather than quietly deleted, because a design
document that only contains decisions that turned out well is not a record of
anything.

## Sessions

The cookie carries 32 random bytes, base64url. The database stores only their
SHA-256.

A fast hash is right here, and the reason is worth stating because it is the
opposite of the password decision three sections down: a session token is
machine-generated randomness, so there is no dictionary for a slow hash to
defend against. All the hash buys is that a database dump does not hand
somebody a live session — and SHA-256 buys that completely.

| Property | Value | Why |
|---|---|---|
| `httpOnly` | yes | A cross-site script cannot read the token. The single most valuable setting here. |
| `sameSite` | `lax` | Survives a link from an email; does not ride along on a cross-site form post. |
| `secure` | in production | Set unconditionally it would simply never arrive over local HTTP. |
| Lifetime | 30 days | Long enough not to annoy; `lastSeenAt` makes an abandoned session visible. |

`lastSeenAt` is touched at most every 15 minutes. Updating it per request turns
every page view into a write for a field nothing urgent reads.

Revocation is a timestamp, not a delete: "signed out at 14:02" is worth keeping,
and a deleted row cannot say it.

**Sessions end when they should.** Signing out revokes one. "Sign out
everywhere" revokes all but the current. Changing a password revokes every
other session — a password change that leaves the old ones live has not locked
anybody out, which is the entire reason most people change one.

## Two ways in

Both end in the same place — a session row and an opaque token — so a third
(federated identity, attaching to `AuthAccount`) changes nothing below that
line.

**Password.** scrypt, from `node:crypto`. Chosen over bcrypt because it needs
no native module and because it is memory-hard, which bcrypt is not: memory
hardness is what makes a GPU farm a poor investment against these hashes.
Argon2id would be the current first choice and needs a native dependency;
N=2^15, r=8 puts scrypt in the same range, at roughly 32 MB and ~100 ms per
hash.

The encoded form is `scrypt$N$r$p$salt$hash`, so the parameters travel with the
hash and raising the cost later does not invalidate what is already stored.

**Email code.** Six digits, from `randomInt` rather than `Math.random` — the
code is a credential, and a predictable credential is not one. Ten-minute
lifetime, five attempts, single use, and the address is mixed into the hash so
a code issued for one inbox cannot be replayed against another. Asking for a
new code consumes the old one: two live codes double the guessing surface and
buy nothing.

With no mailer configured the code prints to the server console — the same
choice as the fake shipping carrier, so somebody evaluating this project can
complete a passwordless sign-in with no API key and exercise the real code path
doing it.

**And it refuses to do that in production.** A one-time code is a complete
authentication factor: `signInWithEmailCode` issues a session on a valid code
alone. Printing one puts a live credential into a log stream, which on every
real platform has a broader and different access model than the database —
somebody with a log-reader seat and no database access could request a code for
any address and read it back. The console mailer therefore throws when
`NODE_ENV` is `production`, naming the fix.

Failing loudly rather than quietly is the point. An unconfigured mailer is
otherwise invisible: `requestSignInCode` returns the same success-shaped result
whether or not an address exists, deliberately, so an operator who never wired
one up would see no error at all — just a sign-in page quietly logging
everybody's codes. Sign-**up** is the one caller that tolerates the refusal: it
warns without repeating the code and creates the account anyway, because the
person already has a password and a session and the address can be verified
later.

## Not telling strangers things

Sign-in is the most-probed endpoint a product has, and the default behaviour of
a naive implementation is to answer the question "does this person have an
account here?"

- **A wrong password and a missing account give the same error**, and take the
  same time. When the address is unknown, verification still runs — against a
  hash of a password nobody has. Skipping that work is what turns sign-in into
  a timing oracle, measurable over a few hundred requests.
- **Asking for a sign-in code always says the same thing**: "if that address has
  an account, a code is on its way." Mail is only sent when there is an account
  to send it to.
- **A tenant you are not a member of is a 404**, identical to one that does not
  exist. Confirming that a merchant exists here is itself a disclosure.

Sign-**up** is the exception, and deliberately: it cannot hide that an address
is taken, because the person has to be told to sign in instead. Enumeration is
defended where defending it is possible.

## Throttling, and its limits

Ten failures per (address, source address) in 15 minutes, counted in memory.

Keyed on both so that one attacker cannot lock a real person out by guessing at
their address from somewhere else. A success clears the record — somebody who
mistyped twice and then got it right is not suspicious.

The honest part: **this is per process.** N instances allow N times the
attempts, and it resets on deploy. The domain model deliberately has no
rate-limit table — a counter written on every failed attempt does not belong in
the primary store — and this project has no shared cache. So the limitation is
written down rather than discovered: it stops the single-machine script, which
is the attack this actually faces, and the interface is the one a shared store
would implement.

## Where the boundary is

```
middleware        cookie present?        cheap, and NOT an authorisation check
  └─ currentContext()                    resolves the session AND the membership
       └─ every page and service         receives a Ctx and trusts it
```

`apps/web/src/lib/session.ts` is the only place that answers "who is this?" and
"are they a member of this tenant?". Everything below receives a `Ctx`.

The middleware checks only that a cookie is *present*. It runs before the page
and should not be doing database work on every request, and a forged value gets
no further than the real check. This is called out in a comment on the file
itself, because middleware that merely *looks* like an authorisation boundary is
worse than none — somebody will eventually trust it.

That seam earned its keep: replacing a development shim that guessed at a user
with real sessions changed the body of `currentContext` and nothing else. The
one page that did change, the workspace list, changed because its *behaviour*
should differ under authentication — it shows the merchants you belong to
rather than every merchant in the database.

Two smaller things the same layer handles: a service `NotFoundError` is
translated into Next's `notFound()` (untranslated it surfaces as a 500, which
tells a visitor that something exists and broke rather than that there is
nothing here for them), and the post-sign-in redirect accepts only a path on
this site.

That second one is worth its own paragraph, because the obvious version of it
is wrong. The first implementation was `/^\/(?!\/)/` — starts with a slash,
but not two — duplicated between the sign-in page and its server actions. It
rejects `//evil.example` and accepts `/\evil.example/phish`, which every
browser reads as an authority: under WHATWG URL parsing a backslash is
equivalent to a slash in a special scheme. A security review caught it, and
reproduced the whole chain against the installed Next build: the guard passed
the payload, `redirect()` performed no validation of its own, and the response
carried `location: /\evil.example/phish` unnormalised. An already-signed-in
visitor following a link on the real domain, with the real certificate, would
land on somebody else's sign-in page.

The fix is not a better pattern. `safeRedirectPath` in `@orderlane/core` asks
the URL parser the same question the browser will ask — resolve against an
unreachable sentinel origin, and accept the answer only if nothing moved:

```ts
const resolved = new URL(raw, "https://redirect-guard.invalid");
if (resolved.origin !== "https://redirect-guard.invalid") return "/";
```

That rejects `//evil`, `/\evil`, `https://evil` and `javascript:` by
construction rather than by enumeration. It lives in the dependency-free
package so it can be tested exhaustively, and both call sites share it — the
duplication is how the page and the action drifted in the first place.

One thing it deliberately does **not** reject: `/%5Cevil.example`. The URL
parser does not decode `%5C` before deciding where an authority starts, so that
stays a path on this origin. A test pins that down, because it is the obvious
next guess and rejecting it would break legitimate paths for nothing — and a
guard that refuses safe input teaches people to route around it.

**A build-time lesson worth keeping:** the session cookie's *name* lives in
`@orderlane/core`, which has no dependencies, because Edge middleware needs it.
Importing it from the service layer pulled the Prisma client — and `node:path`
with it — into the Edge bundle, and the build failed with a stack trace that
named webpack rather than the mistake.

## Not built

- Federated identity. `AuthAccount` exists so that adding it is not a schema
  change, and so "sign in with X" attaches to an existing user rather than
  silently creating a second account for the same person.
- Password reset. It is the email-code flow with a different purpose and a
  `revokeAllSessions` at the end; the pieces are all here.
- Session listing in the UI. `listSessions` returns what a "where you are
  signed in" screen needs.
- WebAuthn, which is where this should go next: it removes the password, and
  with it most of this document.

## How it is tested

33 tests: 9 pure in `packages/core/src/auth.test.ts`, 24 against a real
database in `packages/services/src/auth/`.

The pure ones cover address normalisation (and what is deliberately *not*
normalised — stripping dots and `+tags` is a Gmail convention, not an email
one, and would merge two addresses another provider considers different
people), and the password policy: length and a blocklist, never composition
rules, following NIST SP 800-63B rather than looking strict.

The integration ones cover the flows and, more usefully, the refusals: that a
wrong password and a missing account produce an identical error, that a code is
single-use and dies after five wrong guesses, that a code for one address fails
on another, that a sign-in code is not a verification code, that the stored
token hash is not itself a key, and that changing a password ends every other
session.

The authorisation matrix is verified against the running application: signed
out is a redirect, a forged cookie is a redirect, a revoked session is a
redirect on the very next request, a tenant you are not a member of is a 404
indistinguishable from one that does not exist, and your own is a 200.
