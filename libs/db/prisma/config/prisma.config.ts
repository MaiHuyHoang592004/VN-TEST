// Prisma 7 config — the single source of truth for schema location and the
// database connection. npm scripts pass --config prisma/config/prisma.config.ts.
//
// Environment resolution (in order):
//   1. DATABASE_URL already in the environment (Vercel, CI) → used as-is.
//   2. Otherwise loads the env file: .env.local by default,
//      or the file named in ENV_FILE (e.g. ENV_FILE=.env.prod for prod ops).
//
// NEVER run `prisma db push` or `prisma migrate reset` — schema changes go
// through `npm run db:migrate` (migrate dev) locally and
// `npm run db:migrate:prod` (migrate deploy) against prod. No exceptions.
import path from "node:path";
import { defineConfig } from "prisma/config";

const pkgRoot = path.resolve(__dirname, "../..");

if (!process.env.DATABASE_URL) {
  const envFile = process.env.ENV_FILE ?? ".env.local";
  try {
    process.loadEnvFile(path.join(pkgRoot, envFile));
  } catch {
    // no env file — DATABASE_URL must come from the environment
  }
}

export default defineConfig({
  schema: path.join(pkgRoot, "prisma/schema"),
  migrations: {
    path: path.join(pkgRoot, "prisma/migrations"),
  },
  datasource: {
    // Fallback lets `prisma generate` run where no DB exists (CI/Vercel
    // install step — generate never connects). Commands that DO connect
    // (migrate, studio) fail loudly on the placeholder, as they should.
    url:
      process.env.DATABASE_URL ??
      "postgresql://placeholder@localhost:5432/placeholder",
  },
});
