/**
 * @gwprint/db — the package's public surface. This file only re-exports;
 * it defines nothing, so importing it can never create a cycle.
 *
 * What lives in this package:
 *   client.ts     the database connection (a singleton)
 *   generated/    the client Prisma builds from the schema — never hand-edited
 *   access/       who may see which ROWS (scopes) and which FIELDS (selects),
 *                 and the role→permission map both are driven by
 *   audit.ts      the append-only record of sensitive changes
 *
 * Rule of thumb: anything that answers "how do we talk to the database, and
 * what is each user allowed to get back" belongs here. Business rules (what a
 * refund does) belong in the app's feature modules, not in this package.
 */

// The connection.
export { prisma } from "./client.ts";

// Every generated model type and enum (User, Order, UserRole, Prisma, …).
export * from "./generated/prisma/client.ts";

// Authorization. The role→permission kernel itself lives in
// @gwprint/shared (the browser needs it too); re-exported here so server
// code has one import for "database + who may see what". ./access/roles.ts is
// imported for its compile-time assertion that Prisma's enum matches shared's.
// UserRole is deliberately NOT re-exported from shared: Prisma's generated
// enum (exported above) is the runtime value server code needs, and
// access/roles.ts proves the two are identical.
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  USER_ROLES,
  permissionsFor,
  can,
  scopeFor,
  type Permission,
  type Scope,
  type SessionUser,
} from "@gwprint/shared";
import "./access/roles.ts";
export * from "./access/selects.ts";
export * from "./access/scopes.ts";

// Audit trail.
export { writeAudit, type AuditContext, type AuditInput } from "./audit.ts";

// Abuse protection, shared by libs/auth and the app.
export {
  consumeRateLimit,
  enforceRateLimit,
  pruneRateLimits,
  RateLimitError,
  RATE_LIMITS,
  type RateLimitResult,
  type RateLimitRule,
} from "./rate-limit.ts";
