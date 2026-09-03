/**
 * useLocalStorage Hook
 * useState persisted to localStorage (JSON). SSR-safe: the server render uses
 * the fallback, storage is read once hydration completes.
 *
 * Reads through useSyncExternalStore rather than copying storage into state
 * from an effect — that pattern renders twice on mount and cannot see writes
 * made in another tab. The snapshot is the RAW STRING (a stable primitive);
 * parsing happens in a memo, because returning a freshly-parsed object from
 * getSnapshot would hand React a new identity on every call and loop forever.
 */

"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

/** Same-tab writes need their own notification: the browser fires `storage`
 * only in OTHER tabs. */
const EVENT = "opcreative:local-storage";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // cross-tab
  window.addEventListener(EVENT, onChange); // same-tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const raw = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key),
    () => null, // server: nothing stored, fall back
  );

  // Freeze the fallback on first render. Callers typically pass a literal
  // (`[]`), which would otherwise be a new identity every render and make the
  // returned value unstable for consumers' effects.
  const [fallback] = useState(initialValue);

  const value = useMemo<T>(() => {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback; // corrupt entry — keep the fallback
    }
  }, [raw, fallback]);

  const setStoredValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      // Read current straight from storage so concurrent writers don't clobber
      // each other via a stale closure.
      let current: T;
      try {
        const stored = window.localStorage.getItem(key);
        current = stored === null ? fallback : (JSON.parse(stored) as T);
      } catch {
        current = fallback;
      }

      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(current) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // storage full or blocked — nothing persists, but don't crash
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key, fallback],
  );

  return [value, setStoredValue] as const;
}
