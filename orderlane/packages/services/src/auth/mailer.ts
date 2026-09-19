/**
 * Sending email, behind a port.
 *
 * The default adapter prints to the console, and that is the one a fresh clone
 * uses — the same choice as the fake shipping carrier. Somebody evaluating this
 * project can complete a passwordless sign-in without an API key, and the code
 * path they exercise is the real one.
 */

export interface OutboundEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  readonly name: string;
  send(email: OutboundEmail): Promise<void>;
}

/**
 * Prints the email instead of sending it, so a fresh clone can complete a
 * passwordless sign-in with no API key and exercise the real code path doing it.
 *
 * It REFUSES to run in production, and that refusal is the point. A one-time
 * sign-in code is a complete authentication factor — `signInWithEmailCode`
 * issues a full session on a valid code alone — so printing one puts a live
 * credential into a log stream, which on every real platform has a broader and
 * different access model than the database. Somebody with a log-reader seat and
 * no database access could request a code for any address and read it back.
 *
 * Failing loudly is deliberate too. An unconfigured mailer is otherwise
 * invisible: `requestSignInCode` returns the same success-shaped result whether
 * or not an address exists, on purpose, so an operator who never wired one up
 * would get no error and no warning — just a sign-in page that quietly logs
 * everybody's codes.
 */
export const consoleMailer: Mailer = {
  name: "console",
  async send(email) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error(
        "No mailer is configured, and the console mailer will not print a one-time code in production. " +
          "Call setMailer() with a real transport during startup.",
      );
    }
    // eslint-disable-next-line no-console
    console.log(`\n── email → ${email.to} ──\n${email.subject}\n\n${email.text}\n──\n`);
  },
};

/** Collects instead of sending. Used by the tests to read the code back. */
export function memoryMailer(): Mailer & { sent: OutboundEmail[] } {
  const sent: OutboundEmail[] = [];
  return {
    name: "memory",
    sent,
    async send(email) {
      sent.push(email);
    },
  };
}

let current: Mailer = consoleMailer;

export function setMailer(mailer: Mailer): void {
  current = mailer;
}

export function mailer(): Mailer {
  return current;
}

/** True when nothing has replaced the development default. */
export function isDefaultMailer(): boolean {
  return current === consoleMailer;
}
