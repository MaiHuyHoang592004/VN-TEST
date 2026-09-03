/**
 * The database connection — the ONLY way apps touch Postgres.
 *
 * Kept in its own file rather than in index.ts so that modules needing the
 * client (access/scopes.ts, audit.ts) can import it WITHOUT importing the
 * package barrel, which re-exports them in turn. Sharing one file for both
 * roles created a circular import that happened to work only because every
 * use sat inside a function body.
 *
 * Singleton via globalThis so Next.js dev hot-reload doesn't leak a new
 * connection pool on every file save.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.ts";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
