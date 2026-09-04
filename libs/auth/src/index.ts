/**
 * Shared Auth.js (NextAuth v5) setup — used by every app that needs login.
 *
 * Sign-in methods:
 *   • Google OAuth (auto-verified email)
 *   • Email + password (Credentials; bcrypt hashes in User.passwordHash)
 *   • Email OTP via Resend — used to verify email at signup and as a
 *     passwordless fallback ("email me a code")
 *
 * Sessions are JWTs (cookie): the Credentials provider does not support
 * database sessions — this is the standard Auth.js setup for password
 * logins. The adapter still persists users/accounts/verification tokens.
 */
import { randomInt } from "node:crypto";

import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verifyPassword } from "./password";
import {
  prisma,
  enforceRateLimit,
  consumeRateLimit,
  RATE_LIMITS,
  type UserRole,
} from "@gwprint/db";
import { generateOtp, sendVerificationCode } from "./email.ts";

export {
  registerUser,
  changePasswordForUser,
  changeOwnPassword,
  type RegisterResult,
  type ChangeOwnPasswordResult,
} from "./register.ts";

export { sendVerificationCode, sendInviteEmail } from "./email.ts";

// The authorization kernel lives in @gwprint/shared (the browser needs it
// too); re-exported here so app auth code has a single import surface.
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsFor,
  can,
  scopeFor,
  type Permission,
  type Scope,
  type SessionUser,
} from "@gwprint/shared";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: UserRole[];
      /** Saved UI language, so the first render is already in it. */
      locale?: string;
    } & DefaultSession["user"];
  }
}

/** Extra claims we keep on the JWT. Declared locally rather than via a
 * `declare module "next-auth/jwt"` augmentation, which doesn't resolve when
 * the lib is transpiled inside the app's typecheck. */
type AppToken = {
  id?: string;
  roles?: UserRole[];
  /** The user's saved UI language, so the first server render is already in
   * the right language instead of flashing English. */
  locale?: string;
  /** ms epoch this session began — compared against User.sessionsValidFrom to
   * honour "sign out everywhere" / deactivation on a JWT session. */
  signedInAt?: number;
  /** ms epoch of the last DB revalidation; bounds how stale roles/status can
   * be (see REVALIDATE_MS). */
  checkedAt?: number;
  sub?: string;
};

/** How often the JWT is re-checked against the database. A deactivation,
 * role change or "sign out everywhere" takes effect within this window rather
 * than instantly — the price of not hitting the DB on every single request.
 * 60s is the usual balance between freshness and load. */
const REVALIDATE_MS = 60_000;

/** Password is right but the email was never verified — client reacts by
 * sending an OTP and finishing verification. */
class UnverifiedEmail extends CredentialsSignin {
  code = "unverified";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Cast: @auth/prisma-adapter's types predate Prisma 7's generated client;
  // the runtime contract (model + field names) matches our schema exactly.
  adapter: PrismaAdapter(prisma as never),
  session: { strategy: "jwt" },
  // We only ever run behind trusted hosts (localhost dev, Vercel's proxy);
  // without this, local `next start` rejects every /api/auth request.
  trustHost: true,
  providers: [
    Google({
      // Migrated legacy users already exist with this email + a password.
      // Google verifies email ownership, so auto-linking the Google account
      // to the same-email user is safe — without this they'd be locked out.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        // Throttle password guessing. Returning null (rather than throwing)
        // keeps the failure indistinguishable from a wrong password, so this
        // can't be used to probe which accounts exist.
        const throttle = await consumeRateLimit(`login:${email}`, RATE_LIMITS.login);
        if (!throttle.allowed) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // Unknown email, OAuth-only account, wrong password → same generic
        // failure (no account enumeration via error differences).
        if (!user?.passwordHash || user.deletedAt) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        if (user.status === "BANNED") return null;
        if (!user.emailVerified) throw new UnverifiedEmail();

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          roles: user.roles,
        };
      },
    }),
    // Email OTP (not a magic link): we override token generation and send
    // the 6-digit code itself. The client verifies by hitting
    // /api/auth/callback/resend?email=…&token=<code>. Codes are single-use,
    // stored hashed (VerificationToken), and expire after 10 minutes.
    // Verifying also stamps User.emailVerified — this is the signup
    // email-verification step AND the passwordless fallback.
    // Sends are rate-limited per email (see sendVerificationRequest below).
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      // TODO: switch to a verified gwprint.com sender before production —
      // onboarding@resend.dev only delivers to the Resend account owner.
      from: "GWPrint <onboarding@resend.dev>",
      maxAge: 10 * 60,
      generateVerificationToken: () => generateOtp(randomInt),
      async sendVerificationRequest({ identifier, token }) {
        // The most abusable endpoint we have: unauthenticated, sends mail to
        // an arbitrary address, and costs money per send. Throwing here aborts
        // the sign-in attempt, which is what we want.
        await enforceRateLimit(`otp:send:${identifier}`, RATE_LIMITS.otpSend);
        await sendVerificationCode(identifier, token);
      },
    }),
  ],
  // "/" doubles as the login screen when signed out; auth errors land there
  // too (?error=…) so the card can show an inline message.
  pages: { signIn: "/", error: "/" },
  callbacks: {
    // F4 — status gate at the door, for EVERY provider (the Credentials
    // provider checked only BANNED; Google checked nothing, so an INACTIVE or
    // soft-deleted user could still sign in). A returned false lands on
    // "/?error=AccessDenied".
    async signIn({ user }) {
      if (!user?.id) return true; // e.g. email-verification step; nothing to gate yet
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { status: true, deletedAt: true },
      });
      if (!dbUser) return true; // brand-new OAuth user the adapter just created
      return dbUser.status === "ACTIVE" && !dbUser.deletedAt;
    },

    async jwt({ token, user }) {
      const t = token as AppToken;
      // First sign-in: seed the token from the DB user.
      if (user) {
        t.id = user.id;
        t.roles = (user as { roles?: UserRole[] }).roles ?? [];
        t.signedInAt = Date.now();
        t.checkedAt = Date.now();
        // Read the saved language now rather than waiting for the first
        // revalidation — otherwise someone signing in on a new device sees
        // English for the first minute despite having chosen otherwise.
        if (user.id) {
          const prefs = await prisma.user.findUnique({
            where: { id: user.id },
            select: { locale: true },
          });
          t.locale = prefs?.locale;
        }
        return token;
      }

      // F3 — periodic revalidation against the database. Also keeps roles
      // fresh: without this, roles copied in at sign-in would never update.
      if (t.id && Date.now() - (t.checkedAt ?? 0) > REVALIDATE_MS) {
        const dbUser = await prisma.user.findUnique({
          where: { id: t.id },
          select: {
            roles: true,
            status: true,
            deletedAt: true,
            sessionsValidFrom: true,
            locale: true,
          },
        });
        // Gone, deactivated, or the session predates a revocation cutoff →
        // kill the session (returning null invalidates it in Auth.js v5).
        if (!dbUser || dbUser.status !== "ACTIVE" || dbUser.deletedAt) return null;
        if (
          dbUser.sessionsValidFrom &&
          (t.signedInAt ?? 0) < dbUser.sessionsValidFrom.getTime()
        ) {
          return null;
        }
        t.roles = dbUser.roles;
        t.locale = dbUser.locale;
        t.checkedAt = Date.now();
      }
      return token;
    },

    session({ session, token }) {
      const t = token as AppToken;
      session.user.id = String(t.id ?? t.sub ?? "");
      session.user.roles = t.roles ?? [];
      session.user.locale = t.locale;
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      }
    },
  },
});
