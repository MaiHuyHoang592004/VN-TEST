import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client.ts";

after(async () => { await prisma.$disconnect(); });
test("channel address fields permit null and persist machine-readable validation errors", async () => {
  const columns = await prisma.$queryRaw<{ column_name: string; is_nullable: string; data_type: string }[]>`
    SELECT column_name, is_nullable, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'OrderAddress'`;
  for (const name of ["name", "line1", "city", "postalCode", "countryCode", "validationErrors"]) {
    assert.equal(columns.find((c) => c.column_name === name)?.is_nullable, "YES", name);
  }
  assert.equal(columns.find((c) => c.column_name === "validationErrors")?.data_type, "jsonb");
});
