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

export const consoleMailer: Mailer = {
  name: "console",
  async send(email) {
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
