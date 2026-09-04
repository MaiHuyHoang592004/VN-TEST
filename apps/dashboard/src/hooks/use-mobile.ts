"use client";

import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * The design system's kit floor (RESPONSIVE.md): every ui_kit is authored at
 * >=1024px and `TopNav` has no collapse behaviour designed below it, so the
 * off-canvas sheet is the navigation for EVERYTHING under 1024 — the same
 * width at which the DS puts its own admin Sidebar off-canvas.
 *
 * Deliberately a SECOND breakpoint rather than a change to MOBILE_BREAKPOINT:
 * that constant also drives DataTable's card-vs-table switch, and moving a wide
 * operational table onto stacked cards at 1023px is a product decision
 * (RESPONSIVE.md: "Never reflow a wide operational table into stacked cards
 * without a product decision"), not a side effect of fixing the nav.
 */
const DESKTOP_BREAKPOINT = 1024;
const BELOW_DESKTOP_QUERY = `(max-width: ${DESKTOP_BREAKPOINT - 1}px)`;

/**
 * Subscribe to the media query rather than mirroring it into state from an
 * effect. setState-in-effect makes React render twice on every mount and, on a
 * resize, render with a stale value before correcting itself.
 * useSyncExternalStore is built exactly for "read a value that lives outside
 * React": one render, always consistent, and it tears correctly under
 * concurrent rendering.
 */
function subscribeTo(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

const subscribe = subscribeTo(QUERY);
const subscribeBelowDesktop = subscribeTo(BELOW_DESKTOP_QUERY);

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // The server has no viewport. Desktop-first matches the previous
    // behaviour, where the flag started undefined and read as false.
    () => false,
  );
}

/**
 * True below the DS's 1024px kit floor. Used by the sidebar to decide whether
 * navigation is a sheet — never for content layout.
 */
export function useIsBelowDesktop(): boolean {
  return React.useSyncExternalStore(
    subscribeBelowDesktop,
    () => window.matchMedia(BELOW_DESKTOP_QUERY).matches,
    () => false,
  );
}
