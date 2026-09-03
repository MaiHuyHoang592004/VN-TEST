/**
 * Locale-aware navigation.
 * With context-only i18n (no /en/ URL prefixes) these are thin wrappers around
 * next/link and next/navigation — kept so call sites don't change if URL-locale
 * routing lands later.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, type ComponentProps } from "react";

/** Drop-in Link. forwardRef so it works with asChild triggers. */
export const LocaleLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof Link>
>(function LocaleLink(props, ref) {
  return <Link ref={ref} {...props} />;
});

/** Drop-in router. Same shape as next/navigation's useRouter. */
export function useLocaleRouter() {
  return useRouter();
}
