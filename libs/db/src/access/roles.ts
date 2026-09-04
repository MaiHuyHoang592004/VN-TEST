/**
 * Guarantees the role vocabulary in @gwprint/shared and the UserRole enum
 * Prisma generates from the schema stay identical.
 *
 * Shared can't import Prisma (it must stay dependency-free for the browser),
 * so the two lists are declared separately — and separate lists drift. These
 * assertions make drift a BUILD failure rather than a subtle authorization
 * bug: add a role to the schema without adding it here, and the build breaks
 * pointing at this file.
 */
import type { UserRole as SharedUserRole } from "@gwprint/shared";

import type { UserRole as PrismaUserRole } from "../generated/prisma/client.ts";

/** Compile error unless T and U are exactly the same union. */
type Exact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;

// If either line errors, the schema and shared's USER_ROLES have diverged.
const _prismaCoversShared: Exact<PrismaUserRole, SharedUserRole> = true;
const _sharedCoversPrisma: Exact<SharedUserRole, PrismaUserRole> = true;

void _prismaCoversShared;
void _sharedCoversPrisma;
