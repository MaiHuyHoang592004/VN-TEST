import { defineConfig } from "prisma/config";

// Prisma 7 reads the connection URL here rather than from the schema, and the
// runtime client is given a driver adapter (see src/client.ts). One practical
// consequence worth knowing: the schema file no longer contains a secret, so
// it is safe to read in isolation.
export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
