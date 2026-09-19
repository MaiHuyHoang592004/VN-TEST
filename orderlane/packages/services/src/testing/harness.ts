import { forTenant, systemPrisma } from "@orderlane/db";

import { createProduct, createVariant } from "../catalog/products.ts";
import { createTenant } from "../identity/tenants.ts";

import type { Actor, Ctx } from "../context.ts";

/**
 * Integration tests run against a real PostgreSQL.
 *
 * A mocked Prisma client tests the mock. The interesting failures in this
 * layer — a unique constraint catching a duplicate, an optimistic lock losing
 * a race, a transaction rolling back a half-written order — are all behaviours
 * of the database, and a fake has none of them.
 *
 * The cost is that these tests need a database. Locally, an unset DATABASE_URL
 * skips them so that `npm test` still works on a fresh clone. In CI it throws
 * instead: a pipeline that reports 47 passing tests having run none of them is
 * worse than one that fails, and this project has already been bitten once by
 * a task runner quietly filtering the variable out.
 */
export const hasDatabase = Boolean(process.env["DATABASE_URL"]);

if (!hasDatabase && process.env["CI"]) {
  throw new Error(
    "DATABASE_URL is not set, but CI is. Integration tests must not silently skip in CI — " +
      "check the workflow's postgres service and that the task runner passes DATABASE_URL through.",
  );
}

export const skipWithoutDb = hasDatabase
  ? {}
  : { skip: "DATABASE_URL is not set — integration tests skipped" };

/** Every table Prisma manages, excluding its own migration bookkeeping. */
async function tableNames(): Promise<string[]> {
  const rows = await systemPrisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  return rows.map((r) => r.tablename);
}

/**
 * TRUNCATE rather than DELETE, and CASCADE rather than a dependency-ordered
 * sequence: the order changes every time a foreign key is added, and a test
 * helper that needs maintaining is a test helper that rots.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await tableNames();
  if (tables.length === 0) return;
  const quoted = tables.map((t) => `"public"."${t}"`).join(", ");
  await systemPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

export interface SeededTenant {
  readonly tenantId: string;
  readonly ownerUserId: string;
  readonly ctx: Ctx;
}

let sequence = 0;

/** A tenant with an owner, and a context to act as them. */
export async function seedTenant(
  options: { role?: Actor["role"]; currency?: string } = {},
): Promise<SeededTenant> {
  sequence += 1;
  const slug = `t${sequence}-${Date.now().toString(36)}`;

  const tenant = await systemPrisma.tenant.create({
    data: { slug, name: `Tenant ${sequence}`, currency: options.currency ?? "USD" },
  });
  const user = await systemPrisma.user.create({
    data: { email: `owner-${slug}@example.com`, name: "Owner" },
  });
  await systemPrisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, role: "OWNER" },
  });

  return {
    tenantId: tenant.id,
    ownerUserId: user.id,
    ctx: contextFor(tenant.id, { kind: "USER", id: user.id, role: options.role ?? "OWNER" }),
  };
}

export function contextFor(tenantId: string, actor: Actor): Ctx {
  return { tenantId, actor, db: forTenant(tenantId) };
}

export async function disconnect(): Promise<void> {
  await systemPrisma.$disconnect();
}

/** A bare user with no memberships. */
export async function makeUser(label = "user"): Promise<string> {
  sequence += 1;
  const user = await systemPrisma.user.create({
    data: { email: `${label}-${sequence}-${Date.now().toString(36)}@example.com`, name: label },
  });
  return user.id;
}

/**
 * A tenant built the way the application builds one — through createTenant, so
 * it has its ledger accounts and both workflow definitions installed. Slower
 * than seedTenant, and the right choice for anything that exercises those.
 */
export async function seedFullTenant(): Promise<SeededTenant> {
  sequence += 1;
  const ownerUserId = await makeUser("owner");
  const { tenantId, ctx } = await createTenant({
    slug: `full-${sequence}-${Date.now().toString(36)}`,
    name: `Full tenant ${sequence}`,
    ownerUserId,
  });
  return { tenantId, ownerUserId, ctx };
}

export interface SeededCatalog {
  readonly mugVariantId: string;
  readonly printVariantId: string;
}

/** Two products, two variants: enough for a two-line order that can be split. */
export async function seedCatalog(ctx: Ctx): Promise<SeededCatalog> {
  const mug = await createProduct(ctx, { slug: "ceramic-mug", title: "Ceramic Mug" });
  const mugVariant = await createVariant(ctx, mug.id, {
    sku: "mug-11oz",
    title: "Ceramic Mug 11oz",
    priceMinor: 1_250,
    options: { size: "11oz" },
  });

  const print = await createProduct(ctx, { slug: "canvas-print", title: "Canvas Print" });
  const printVariant = await createVariant(ctx, print.id, {
    sku: "print-12x16",
    title: "Canvas Print 12x16",
    priceMinor: 3_400,
    options: { size: "12x16" },
  });

  return { mugVariantId: mugVariant.id, printVariantId: printVariant.id };
}
