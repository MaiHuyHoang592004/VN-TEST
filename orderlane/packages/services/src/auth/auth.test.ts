import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { systemPrisma } from "@orderlane/db";

import { ConflictError, ForbiddenError, ValidationError } from "../errors.ts";
import { disconnect, skipWithoutDb } from "../testing/harness.ts";
import { consumeEmailCode, issueEmailCode } from "./codes.ts";
import { memoryMailer, setMailer } from "./mailer.ts";
import {
  changePassword,
  requestSignInCode,
  signInWithEmailCode,
  signInWithPassword,
  signUpWithPassword,
} from "./signin.ts";
import { listSessions, resolveSession, revokeAllSessions, revokeSession } from "./sessions.ts";
import { THROTTLE_LIMITS, resetThrottle } from "./throttle.ts";

/**
 * These tests do not reset the database — see testing/isolation.test.ts. Every
 * one uses a fresh address, which is what isolates them here.
 */
const mail = memoryMailer();
setMailer(mail);

beforeEach(() => {
  resetThrottle();
  mail.sent.length = 0;
});

after(async () => {
  if (skipWithoutDb.skip) return;
  await disconnect();
});

let n = 0;
const anEmail = () => `user-${(n += 1)}-${Date.now().toString(36)}@example.com`;
const PASSWORD = "correct horse battery staple";

/** The last code this mailer saw, read out of the email body. */
function lastCode(): string {
  const body = mail.sent.at(-1)?.text ?? "";
  return /\b(\d{6})\b/.exec(body)?.[1] ?? "";
}

test("signing up issues a session and a verification code", skipWithoutDb, async () => {
  const email = anEmail();
  const session = await signUpWithPassword({ email, password: PASSWORD, name: "Ada" });

  const resolved = await resolveSession(session.token);
  assert.equal(resolved?.email, email);
  assert.equal(resolved?.name, "Ada");

  assert.equal(mail.sent.length, 1, "an address is asked to prove itself");
  assert.match(mail.sent[0]!.text, /\b\d{6}\b/);

  const user = await systemPrisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(user.emailVerifiedAt, null, "signing in does not wait for the email to arrive");
  assert.notEqual(user.passwordHash, PASSWORD);
  assert.ok(user.passwordHash?.startsWith("scrypt$"));
});

test("an address normalises to one spelling", skipWithoutDb, async () => {
  const email = anEmail();
  await signUpWithPassword({ email: `  ${email.toUpperCase()} `, password: PASSWORD });
  const session = await signInWithPassword({ email, password: PASSWORD });
  assert.ok(await resolveSession(session.token));
});

test("signing up twice is a conflict the person can act on", skipWithoutDb, async () => {
  const email = anEmail();
  await signUpWithPassword({ email, password: PASSWORD });
  // Sign-up cannot hide that an address is taken: the person has to be told to
  // sign in instead. Enumeration is defended on sign-in, where it is possible.
  await assert.rejects(() => signUpWithPassword({ email, password: PASSWORD }), ConflictError);
});

test("a weak password is refused with every reason at once", skipWithoutDb, async () => {
  await assert.rejects(
    () => signUpWithPassword({ email: "ada@example.com", password: "ada" }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.deepEqual(
        (error.details as { code: string }[]).map((i) => i.code).sort(),
        ["contains_email", "too_short"],
      );
      return true;
    },
  );
});

test("a wrong password and a missing account are the same answer", skipWithoutDb, async () => {
  const email = anEmail();
  await signUpWithPassword({ email, password: PASSWORD });

  const wrongPassword = await signInWithPassword({ email, password: "not the password" }).catch((e: Error) => e);
  const noAccount = await signInWithPassword({ email: anEmail(), password: PASSWORD }).catch((e: Error) => e);

  assert.ok(wrongPassword instanceof ValidationError);
  assert.ok(noAccount instanceof ValidationError);
  assert.equal(
    wrongPassword.message,
    noAccount.message,
    "distinguishing them turns sign-in into a service for finding out who has an account",
  );
});

test("repeated failures are throttled, and a success clears the record", skipWithoutDb, async () => {
  const email = anEmail();
  await signUpWithPassword({ email, password: PASSWORD });

  for (let i = 0; i < THROTTLE_LIMITS.maxFailures; i++) {
    await assert.rejects(() => signInWithPassword({ email, password: "wrong" }, { ip: "10.0.0.1" }));
  }
  await assert.rejects(
    () => signInWithPassword({ email, password: PASSWORD }, { ip: "10.0.0.1" }),
    ForbiddenError,
    "even the right password waits, or the throttle is a formality",
  );

  // Keyed on address AND address source, so one attacker cannot lock a real
  // person out from somewhere else.
  await assert.doesNotReject(() => signInWithPassword({ email, password: PASSWORD }, { ip: "10.0.0.2" }));

  resetThrottle();
  await assert.doesNotReject(() => signInWithPassword({ email, password: PASSWORD }, { ip: "10.0.0.1" }));
});

test("a passwordless sign-in works end to end", skipWithoutDb, async () => {
  const email = anEmail();
  await signUpWithPassword({ email, password: PASSWORD });
  mail.sent.length = 0;

  await requestSignInCode(email);
  assert.equal(mail.sent.length, 1);

  const session = await signInWithEmailCode(email, lastCode());
  assert.equal((await resolveSession(session.token))?.email, email);

  const user = await systemPrisma.user.findUniqueOrThrow({ where: { email } });
  assert.notEqual(user.emailVerifiedAt, null, "reading the code proves the address");
});

test("asking for a code for an unknown address says the same thing and sends nothing", skipWithoutDb, async () => {
  const result = await requestSignInCode(anEmail());
  assert.ok(result.expiresAt instanceof Date, "the caller cannot tell the difference");
  assert.equal(mail.sent.length, 0, "and no mail goes to an address that did not ask for it");
});

test("a code is single use", skipWithoutDb, async () => {
  const email = anEmail();
  await signUpWithPassword({ email, password: PASSWORD });
  await requestSignInCode(email);
  const code = lastCode();

  await signInWithEmailCode(email, code);
  await assert.rejects(() => signInWithEmailCode(email, code), ValidationError);
});

test("asking for a new code invalidates the old one", skipWithoutDb, async () => {
  const email = anEmail();
  await signUpWithPassword({ email, password: PASSWORD });

  await requestSignInCode(email);
  const first = lastCode();
  await requestSignInCode(email);
  const second = lastCode();
  assert.notEqual(first, second);

  await assert.rejects(() => signInWithEmailCode(email, first), ValidationError, "two live codes double the guessing surface");
  await assert.doesNotReject(() => signInWithEmailCode(email, second));
});

test("a code expires", skipWithoutDb, async () => {
  const email = anEmail();
  await issueEmailCode(email, "SIGN_IN");
  const code = lastCode();

  await systemPrisma.emailCode.updateMany({
    where: { email, consumedAt: null },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  assert.equal(await consumeEmailCode(email, code, "SIGN_IN"), "expired");
});

test("a code burns after five wrong guesses", skipWithoutDb, async () => {
  const email = anEmail();
  await issueEmailCode(email, "SIGN_IN");
  const code = lastCode();
  const wrong = code === "000000" ? "111111" : "000000";

  for (let i = 0; i < 4; i++) {
    assert.equal(await consumeEmailCode(email, wrong, "SIGN_IN"), "invalid");
  }
  assert.equal(await consumeEmailCode(email, wrong, "SIGN_IN"), "too_many_attempts");
  assert.equal(
    await consumeEmailCode(email, code, "SIGN_IN"),
    "invalid",
    "the right code is dead too — an attacker who used their tries gets nothing more",
  );
});

test("a code issued for one address cannot be used on another", skipWithoutDb, async () => {
  const a = anEmail();
  const b = anEmail();
  await issueEmailCode(a, "SIGN_IN");
  const code = lastCode();
  await issueEmailCode(b, "SIGN_IN");

  assert.equal(await consumeEmailCode(b, code, "SIGN_IN"), "invalid");
});

test("a sign-in code is not a verification code", skipWithoutDb, async () => {
  const email = anEmail();
  await issueEmailCode(email, "VERIFY_EMAIL");
  const code = lastCode();
  assert.equal(await consumeEmailCode(email, code, "SIGN_IN"), "invalid", "purposes do not cross");
});

test("only the hash of a token is stored", skipWithoutDb, async () => {
  const email = anEmail();
  const session = await signUpWithPassword({ email, password: PASSWORD });
  const row = await systemPrisma.session.findUniqueOrThrow({ where: { id: session.sessionId } });

  assert.notEqual(row.tokenHash, session.token);
  assert.equal(row.tokenHash.length, 64);
  assert.equal(await resolveSession(row.tokenHash), null, "the stored value is not itself a key");
});

test("an unknown, revoked or expired token all resolve to nothing", skipWithoutDb, async () => {
  const email = anEmail();
  const session = await signUpWithPassword({ email, password: PASSWORD });

  assert.equal(await resolveSession(undefined), null);
  assert.equal(await resolveSession("not-a-token"), null);

  await revokeSession(session.token);
  assert.equal(await resolveSession(session.token), null);

  const second = await signInWithPassword({ email, password: PASSWORD });
  await systemPrisma.session.update({
    where: { id: second.sessionId },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  assert.equal(await resolveSession(second.token), null);
});

test("signing out everywhere ends the others and keeps this one", skipWithoutDb, async () => {
  const email = anEmail();
  const first = await signUpWithPassword({ email, password: PASSWORD });
  const second = await signInWithPassword({ email, password: PASSWORD });
  const third = await signInWithPassword({ email, password: PASSWORD });

  const user = await systemPrisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal((await listSessions(user.id)).length, 3);

  await revokeAllSessions(user.id, third.sessionId);
  assert.equal(await resolveSession(first.token), null);
  assert.equal(await resolveSession(second.token), null);
  assert.ok(await resolveSession(third.token));
});

test("changing a password ends every other session", skipWithoutDb, async () => {
  const email = anEmail();
  const old = await signUpWithPassword({ email, password: PASSWORD });
  const keep = await signInWithPassword({ email, password: PASSWORD });
  const user = await systemPrisma.user.findUniqueOrThrow({ where: { email } });

  await assert.rejects(
    () => changePassword(user.id, "wrong current", "a whole new passphrase", keep.sessionId),
    ValidationError,
  );

  await changePassword(user.id, PASSWORD, "a whole new passphrase", keep.sessionId);

  assert.equal(
    await resolveSession(old.token),
    null,
    "a password change that leaves old sessions live has locked nobody out",
  );
  assert.ok(await resolveSession(keep.token), "the session doing the changing survives");
  await assert.rejects(() => signInWithPassword({ email, password: PASSWORD }), ValidationError);
  await assert.doesNotReject(() => signInWithPassword({ email, password: "a whole new passphrase" }));
});

// ─── Regression: a one-time code must never reach a production log ───────────

test("the console mailer refuses to print a code in production", async () => {
  // Pure: no database needed, so it runs everywhere the suite does.
  const { consoleMailer } = await import("./mailer.ts");
  const previous = process.env["NODE_ENV"];
  try {
    process.env["NODE_ENV"] = "production";
    await assert.rejects(
      () => consoleMailer.send({ to: "someone@example.com", subject: "482913 is your code", text: "482913" }),
      /No mailer is configured/,
      "printing a live authentication factor into a log stream is not an acceptable default",
    );
  } finally {
    if (previous === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = previous;
  }
});

test("outside production it still prints, because that is what it is for", async () => {
  const { consoleMailer } = await import("./mailer.ts");
  const previous = process.env["NODE_ENV"];
  const logged: string[] = [];
  const realLog = console.log;
  try {
    process.env["NODE_ENV"] = "development";
    console.log = (...args: unknown[]) => void logged.push(args.join(" "));
    await consoleMailer.send({ to: "someone@example.com", subject: "482913 is your code", text: "482913" });
  } finally {
    console.log = realLog;
    if (previous === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = previous;
  }
  assert.equal(logged.length, 1);
  assert.match(logged[0]!, /482913/);
});

test("signing up survives a mailer that refuses", skipWithoutDb, async () => {
  // The account and its session are the point; the verification code is not.
  const { setMailer: swap } = await import("./mailer.ts");
  const email = anEmail();
  const realLog = console.warn;
  const warnings: string[] = [];
  try {
    swap({ name: "broken", async send() { throw new Error("no transport"); } });
    console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
    const session = await signUpWithPassword({ email, password: PASSWORD });
    assert.equal((await resolveSession(session.token))?.email, email);
  } finally {
    console.warn = realLog;
    swap(mail);
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /could not send a verification code/);
  assert.doesNotMatch(warnings[0]!, /\d{6}/, "and the warning does not repeat the code");
});

test("requesting a sign-in code does NOT survive a mailer that refuses", skipWithoutDb, async () => {
  // The opposite call: here sending IS the operation, so a silent success
  // would leave somebody waiting for an email that was never sent.
  const { setMailer: swap } = await import("./mailer.ts");
  const email = anEmail();
  await signUpWithPassword({ email, password: PASSWORD });
  try {
    swap({ name: "broken", async send() { throw new Error("no transport"); } });
    await assert.rejects(() => requestSignInCode(email), /no transport/);
  } finally {
    swap(mail);
  }
});
