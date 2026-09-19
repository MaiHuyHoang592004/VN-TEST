import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client.ts";
import { isTenantScoped, scopeArgs } from "./tenant-scope.ts";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] ?? "" });

/**
 * The unscoped client.
 *
 * Named so that using it is a decision somebody can grep for. Legitimate
 * callers: migrations, the seed script, sign-in (which must find a user before
 * any tenant is known), and admin tooling that deliberately spans tenants.
 * Everything else goes through forTenant().
 */
export const systemPrisma = new PrismaClient({ adapter });

/**
 * A client that cannot see outside one tenant.
 *
 * Note what this does NOT do: it does not check that the current user is a
 * member of `tenantId`. That is the caller's job, once, at the request
 * boundary — this only guarantees that once a tenant is chosen, no query
 * strays outside it.
 */
export function forTenant(tenantId: string) {
  if (!tenantId) throw new Error("forTenant() needs a tenant id");

  return systemPrisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantScoped(model)) return query(args);
          return query(scopeArgs(operation, args as Record<string, unknown>, tenantId));
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forTenant>;

/**
 * The client handed to a `$transaction` callback: everything a scoped client
 * can do except start another transaction or manage the connection.
 *
 * Named so that a service which must run several writes atomically can accept
 * one as a parameter — which is how the import pipeline applies a row and
 * records that it applied it in the same unit.
 */
export type TenantTx = Omit<
  TenantClient,
  "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends"
>;
