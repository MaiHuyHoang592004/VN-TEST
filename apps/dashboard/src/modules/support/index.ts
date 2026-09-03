/**
 * support — the seller↔staff conversation: tickets, their threads and their
 * attachments.
 *
 * Public surface for other domains (see identity/index.ts for the rule). The
 * open-ticket count is here because the dashboard home (doc 07 D1) shows it
 * next to numbers that come from finance and fulfillment.
 */
export { countOpenTickets, TicketError } from "./tickets/service.ts";
