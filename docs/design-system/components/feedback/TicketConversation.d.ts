/**
 * Support ticket thread. Seller messages left on white, GWP support replies
 * right on sky — brand colour marks "us".
 */
export interface TicketMessage {
  /** `seller` renders left on white; `support` renders right on sky. */
  from: "seller" | "support";
  author: string;
  /** Timestamp string, e.g. "10:04 AM". */
  time?: string;
  body: React.ReactNode;
  avatar?: React.ReactNode;
}
export interface TicketConversationProps {
  /** Header row — ticket ref, order ref and a StatusBadge. */
  header?: React.ReactNode;
  messages?: TicketMessage[];
  /** Reply composer — an Input plus a primary Button. */
  composer?: React.ReactNode;
}
export function TicketConversation(props: TicketConversationProps): JSX.Element;
