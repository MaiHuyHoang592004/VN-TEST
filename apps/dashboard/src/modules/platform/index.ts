/**
 * platform — cross-cutting variant surfaces that aren't a business domain:
 * the audit trail, notifications, search, and third-party integrations.
 *
 * Note the split from `core`: core is infrastructure every module imports
 * (guards, session, shared schema primitives). platform is *features* that
 * happen to span domains, and it obeys the same boundary rule as any domain.
 */

// ONLY what other domains legitimately need. listAuditLog is deliberately NOT
// here: the audit page imports it directly, and re-exporting a `server-only`
// query through the barrel would drag that constraint into every domain that
// raises a notification — which also breaks `node --test`.
export {
  notify,
  notifyMany,
  usersWithPermission,
  warehouseMemberIds,
  type AppNotification,
} from "./notifications/service.ts";

// Outbound seller webhooks. Fulfillment calls these AFTER a commit — see the
// service's header for why never inside one.
export {
  dispatchWebhook,
  dispatchWebhookMany,
  type WebhookEvent,
} from "./webhooks/service.ts";
