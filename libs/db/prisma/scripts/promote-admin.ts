/**
 * Bootstrap the first administrator.
 *
 *   cd libs/db && npm run db:promote -- someone@example.com
 *   cd libs/db && ENV_FILE=.env.prod npm run db:promote -- someone@example.com
 *
 * WHY THIS EXISTS AT ALL. Admins are created by other admins through
 * /admin/users — but the very first one can't be, because there is nobody to
 * grant it. That is the only legitimate use for this script: run it once per
 * environment, then never again.
 *
 * It is deliberately NOT a self-service route in the app. GWPrint is one
 * company with external sellers, so a signup form that could hand out ADMIN
 * would let anyone who registers take over the business.
 */
import { prisma } from "../../src/client.ts";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: npm run db:promote -- <email>");
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email },
  select: { id: true, email: true, roles: true, status: true },
});

if (!user) {
  // Sign in once first: the account is created by the login flow, not here.
  console.error(`No account for ${email}. Have them sign in once, then re-run.`);
  process.exit(1);
}

if (user.roles.includes("ADMIN")) {
  console.log(`${email} is already an ADMIN — nothing to do.`);
  process.exit(0);
}

await prisma.user.update({
  where: { id: user.id },
  data: {
    roles: { set: [...new Set([...user.roles, "ADMIN" as const])] },
    // Force a re-read of their session so the change lands immediately rather
    // than after the 60s revalidation window.
    sessionsValidFrom: new Date(),
  },
});

console.log(`Promoted ${email} → ADMIN (was ${user.roles.join(", ") || "no roles"}).`);
console.log("They may need to reload the page for the sidebar to appear.");

await prisma.$disconnect();
