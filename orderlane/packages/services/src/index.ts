/**
 * The use-case surface. Everything a route handler or a page should need, and
 * nothing that would let one reach past this layer into the database.
 */

export type { Actor, Ctx } from "./context.ts";
export {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceError,
  ValidationError,
  isUniqueViolation,
} from "./errors.ts";

export { contextForUser, createTenant, listMembers, requireRole, resolveMembership, setMemberRole } from "./identity/tenants.ts";
export { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from "./identity/api-keys.ts";

export {
  changePassword,
  requestSignInCode,
  signInWithEmailCode,
  signInWithPassword,
  signUpWithPassword,
  verifyEmailWithCode,
} from "./auth/signin.ts";
export {
  SESSION_COOKIE,
  createSession,
  listSessions,
  purgeExpiredSessions,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  type IssuedSession,
  type ResolvedSession,
  type SessionMeta,
} from "./auth/sessions.ts";
export { consoleMailer, memoryMailer, setMailer, type Mailer, type OutboundEmail } from "./auth/mailer.ts";
export { purgeExpiredCodes } from "./auth/codes.ts";

export { createProduct, createVariant, listProducts, resolveSkus, setProductStatus } from "./catalog/products.ts";

export { createOrder, createOrderIdempotent, getOrder, listOrders, type OrderDetail } from "./orders/orders.ts";

export { activeDefinition, installDefinition, loadDefinition, setActiveDefinition } from "./workflow/definitions.ts";
export {
  applyTransition,
  availableTransitions,
  factsForFulfillment,
  startFulfillment,
  transitionHistory,
  type TransitionHistoryEntry,
  type TransitionOutcome,
} from "./workflow/instances.ts";

export { balance, chargeOrder, fundWallet, post, refreshSnapshot, refundOrder } from "./ledger/postings.ts";

export { commitImport, previewImport, stageImport } from "./import/jobs.ts";
export type { PersistedImportAdapter } from "./import/adapter.ts";

export type { Page, PageRequest } from "./keyset.ts";
