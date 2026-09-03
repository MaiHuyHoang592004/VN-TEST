"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False while rendering on the server and during hydration, true afterwards.
 *
 * Replaces the `const [mounted, setMounted] = useState(false)` +
 * `useEffect(() => setMounted(true), [])` idiom, which schedules an extra
 * render pass through state. Here React simply swaps the server snapshot for
 * the client one once hydration finishes.
 *
 * Use it only for genuine hydration mismatches — content that legitimately
 * differs between server and client (a theme icon, a locale-formatted date).
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(noop, onClient, onServer);
}
