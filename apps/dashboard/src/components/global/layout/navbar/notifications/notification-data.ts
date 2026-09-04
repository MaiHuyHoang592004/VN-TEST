/**
 * How a notification TYPE becomes something on screen.
 *
 * The database stores a type plus values, never rendered prose — so a
 * notification written while the reader used English still reads correctly
 * after they switch language. This file is the only place that knows which
 * locale keys, category and icon a type maps to; adding a type means adding a
 * column here and nothing else.
 */
import type { NotificationType } from "@gwprint/db";

export type NotificationCategory =
  | "orders"
  | "warehouse"
  | "payments"
  | "system";

/** Shape the panel renders, produced by modules/platform/notifications. */
export interface AppNotification {
  id: string;
  type: NotificationType;
  /** Values interpolated into the localized strings. */
  values: Record<string, string>;
  href: string | null;
  read: boolean;
  /** ISO timestamp; the panel renders it relative. */
  createdAt: string;
}

type Meta = { category: NotificationCategory; key: string };

export const NOTIFICATION_META: Record<NotificationType, Meta> = {
  INVITE_RECEIVED: { category: "system", key: "inviteReceived" },
  INVITE_ACCEPTED: { category: "system", key: "inviteAccepted" },
  ROLE_CHANGED: { category: "system", key: "roleChanged" },
  BALANCE_TOPPED_UP: { category: "payments", key: "toppedUp" },
  BALANCE_REFUNDED: { category: "payments", key: "refunded" },
  TRANSACTION_APPROVED: { category: "payments", key: "transactionApproved" },
  TRANSACTION_REJECTED: { category: "payments", key: "transactionRejected" },
  ORDER_ASSIGNED: { category: "orders", key: "ordersAssigned" },
  ORDER_CREATED: { category: "orders", key: "orderCreated" },
  ORDER_STATUS_CHANGED: { category: "orders", key: "orderStatusChanged" },
  // Warehouse-facing: work landed at a site the reader staffs.
  WORK_ASSIGNED: { category: "warehouse", key: "workAssigned" },
  // Admin/support-facing: an order stalled and someone has to look at it.
  ORDER_ON_HOLD: { category: "orders", key: "orderOnHold" },
  // Seller-facing: their parcel has a label and a tracking number, which is
  // the moment they can tell their own warehouse something.
  SHIPPING_LABEL_READY: { category: "orders", key: "shippingLabelReady" },
  // Seller-facing, carrier axis. Only outcomes reach here — a notification per
  // scan along the route would be a bell nobody reads.
  TRACKING_UPDATED: { category: "orders", key: "trackingUpdated" },
  // Warehouse-facing: the floor is stopped and only a human can clear it.
  FULFILLMENT_BLOCKED: { category: "warehouse", key: "fulfillmentBlocked" },
  // Money-adjacent failure, so it is never silent.
  LABEL_PURCHASE_FAILED: { category: "warehouse", key: "labelPurchaseFailed" },
  // A seller asked for money to move. Goes to whoever holds the approve grant
  // — the queue they work from, rather than a page they have to remember to
  // check.
  TRANSACTION_REQUESTED: { category: "payments", key: "transactionRequested" },
  // Support, both directions: the seller hears the answer, staff hear the
  // follow-up. Legacy sent neither, so people refreshed the page instead.
  TICKET_REPLIED: { category: "system", key: "ticketReplied" },
  TICKET_STATUS_CHANGED: { category: "system", key: "ticketStatusChanged" },
};
