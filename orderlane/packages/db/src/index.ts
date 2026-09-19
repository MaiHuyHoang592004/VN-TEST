export { systemPrisma, forTenant, type TenantClient } from "./client.ts";
export { TENANT_SCOPED_MODELS, isTenantScoped, scopeArgs, type TenantScopedModel } from "./tenant-scope.ts";

/**
 * Re-exported so that packages above this one can NAME the shapes they return.
 *
 * Without this, a service whose return type is inferred from a Prisma query
 * produces a type TypeScript can only describe by pointing into
 * node_modules/@orderlane/db/src/generated — which is not a portable path, and
 * which TS refuses to write into a declaration (TS2742). Re-exporting is the
 * fix; annotating every service by hand would be the workaround.
 */
export { Prisma } from "./generated/client.ts";
export type {
  ApiKey,
  Asset,
  BalanceSnapshot,
  Fulfillment,
  FulfillmentLine,
  ImportJob,
  ImportRow,
  LedgerAccount,
  LedgerEntry,
  LedgerTransaction,
  Location,
  Membership,
  Order,
  OrderLine,
  Product,
  Shipment,
  StockItem,
  StockMovement,
  Tenant,
  TransitionLog,
  User,
  Variant,
  Webhook,
  WebhookDelivery,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowState,
  WorkflowTransition,
} from "./generated/client.ts";
export type {
  AssetKind,
  ImportJobStatus,
  ImportKind,
  ImportRowAction,
  ImportRowStatus,
  LedgerAccountKind,
  LedgerDirection,
  LedgerTransactionKind,
  MembershipRole,
  ProductStatus,
  ShipmentStatus,
  StockMovementKind,
  WorkflowStateKind,
} from "./generated/enums.ts";
