/**
 * @fulfillflow/db — the package's public surface. This file only re-exports;
 * it defines nothing, so importing it can never create a cycle.
 *
 * client.ts    the database connection (a singleton)
 * generated/   the client Prisma builds from the schema — never hand-edited
 * queue.ts     claimOutbox / claimIngestion / completeOutbox / failOutbox (Task 6)
 */
export { prisma } from "./client.ts";
export * from "./generated/prisma/client.ts";
export * from "./queue.ts";
