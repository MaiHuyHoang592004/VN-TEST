"use client";

import { usePathname } from "next/navigation";

/**
 * The ground every signed-in page sits on.
 *
 * The DS sanctions exactly ONE gradient for the admin shell: `--field-admin`,
 * a vertical sky→white dissolve, one per screen, admin surfaces only, never
 * diagonal or radial. Its stops are absolute px, so it reads the same on an
 * 800px screen and a 4000px scroll. Seller screens stay flat sky.
 *
 * A CLIENT component reading `usePathname()`, not a server layout reading an
 * `x-pathname` header: this app sets no such header, and Next.js does not set
 * one itself. The documented alternative — middleware that stamps it — would
 * change request handling for every route in the app, which is far more risk
 * than a background is worth. There is no middleware here and this does not
 * add one.
 *
 * `{children}` is rendered untouched, so the server components inside it are
 * still server-rendered; only this wrapper is client code.
 */
export function ProtectedField({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const adminField =
    pathname.startsWith("/admin") || pathname.startsWith("/fulfillment");

  return (
    <div
      data-slot="protected-field"
      data-field={adminField ? "admin" : "canvas"}
      className="flex flex-1 flex-col"
      style={adminField ? { background: "var(--field-admin)" } : undefined}
    >
      {children}
    </div>
  );
}
