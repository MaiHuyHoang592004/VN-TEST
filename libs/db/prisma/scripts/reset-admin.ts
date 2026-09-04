/**
 * Hands the system to its real owner and clears what the demo left behind.
 *
 *   · creates huyhoang5924@gmail.com as the ADMIN, email already verified;
 *   · removes niyamvora@gmail.com, which seed-demo.ts hardcoded as the admin
 *     and deliberately never deletes;
 *   · drops the 25 Variant rows the wipe leaves orphaned. Variant is SHARED
 *     master data ("Black", "iPhone 15", "Sand / L") so the wipe is right not
 *     to touch it — but with every product gone they reference nothing, and
 *     they are the wrong vocabulary for a catalogue of glass suncatchers.
 *
 * NO PASSWORD IS SET. The account signs in with the email-code flow, the same
 * way the account it replaces did (that one had no password either). With
 * AUTH_OTP_CONSOLE=1 in .env.local the code is printed to the dev server's
 * terminal instead of being emailed.
 *
 * LOCAL ONLY.
 */
import { prisma } from "../../src/client.ts";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error(`Refusing to run: ${url.replace(/:[^:@]*@/, ":***@")} is not a local database.`);
  process.exit(1);
}

const NEW_ADMIN = "huyhoang5924@gmail.com";
const OLD_ADMIN = "niyamvora@gmail.com";

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: NEW_ADMIN },
    update: { roles: ["ADMIN"], status: "ACTIVE", emailVerified: new Date() },
    create: {
      email: NEW_ADMIN,
      name: "Hoang Mai Huy",
      roles: ["ADMIN"],
      status: "ACTIVE",
      emailVerified: new Date(),
    },
    select: { id: true, email: true, roles: true },
  });
  console.log(`→ admin ready: ${admin.email} ${JSON.stringify(admin.roles)} (no password — use the email code)`);

  const old = await prisma.user.findUnique({ where: { email: OLD_ADMIN }, select: { id: true } });
  if (old) {
    // The audit trail points at the actor, so it goes first.
    await prisma.auditLog.deleteMany({ where: { actorId: old.id } });
    await prisma.notification.deleteMany({ where: { userId: old.id } });
    await prisma.transaction.deleteMany({ where: { userId: old.id } });
    await prisma.apiKey.deleteMany({ where: { userId: old.id } });
    await prisma.warehouseMember.deleteMany({ where: { userId: old.id } });
    await prisma.account.deleteMany({ where: { userId: old.id } });
    await prisma.session.deleteMany({ where: { userId: old.id } });
    await prisma.user.delete({ where: { id: old.id } });
    console.log(`→ removed ${OLD_ADMIN}`);
  } else {
    console.log(`→ ${OLD_ADMIN}: not present`);
  }

  const orphans = await prisma.variant.findMany({
    where: { productVariants: { none: {} }, orders: { none: {} } },
    select: { id: true, key: true },
  });
  if (orphans.length) {
    await prisma.variant.deleteMany({ where: { id: { in: orphans.map((v) => v.id) } } });
    console.log(`→ removed ${orphans.length} orphaned variants: ${orphans.map((v) => v.key).join(", ")}`);
  }

  const users = await prisma.user.findMany({ select: { email: true, roles: true } });
  console.log(`\nusers now: ${users.map((u) => `${u.email} ${JSON.stringify(u.roles)}`).join(" | ")}`);
  console.log(`variants now: ${await prisma.variant.count()}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
