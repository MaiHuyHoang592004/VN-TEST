/**
 * The category → pixels half of rendering a notification: icons, colors, and
 * the two tiny formatters. Shared by the bell panel and /notifications.
 *
 * Split from notification-data so that file stays a pure type→meta table —
 * importable anywhere, including node tests — while this one may pull in icon
 * components.
 */
import {
  Package,
  Boxes,
  Wallet,
  Info,
  type LucideIcon,
} from "lucide-react";

import type { NotificationCategory } from "./notification-data";

/** Tab order both surfaces show: the bell panel and /notifications. */
export const TABS: Array<"all" | NotificationCategory> = [
  "all",
  "orders",
  "customer",
  "payments",
  "system",
];

export const CATEGORY_ICON: Record<NotificationCategory, LucideIcon> = {
  orders: Package,
  customer: Boxes,
  payments: Wallet,
  system: Info,
};

export const CATEGORY_COLOR: Record<NotificationCategory, string> = {
  orders: "stroke-vercel-blue",
  customer: "stroke-vercel-purple",
  payments: "stroke-vercel-green",
  system: "stroke-muted-foreground",
};

/** t() has no interpolation — fill {placeholders} locally. */
export function fmt(text: string, values?: Record<string, string>) {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);
}

export function relativeTime(iso: string, t: (k: string) => string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}${t("notifications.time.m")}`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}${t("notifications.time.h")}`;
  return `${Math.floor(minutes / 1440)}${t("notifications.time.d")}`;
}
