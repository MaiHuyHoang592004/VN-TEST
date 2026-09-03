"use client";

import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Subscribe to the media query rather than mirroring it into state from an
 * effect. setState-in-effect makes React render twice on every mount and, on a
 * resize, render with a stale value before correcting itself.
 * useSyncExternalStore is built exactly for "read a value that lives outside
 * React": one render, always consistent, and it tears correctly under
 * concurrent rendering.
 */
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // The server has no viewport. Desktop-first matches the previous
    // behaviour, where the flag started undefined and read as false.
    () => false,
  );
}
