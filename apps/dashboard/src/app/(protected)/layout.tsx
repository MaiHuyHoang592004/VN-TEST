import { redirect } from "next/navigation";
import { auth } from "@opcreative/auth";

import { ProtectedField } from "@/components/global/layout/protected-field";

/**
 * Every page in this group requires a session; signed-out visitors land on
 * "/" (the login screen). DB-session check runs server-side per request —
 * no proxy.ts needed (proxy can't share the Prisma client anyway).
 *
 * The wrapper adds the DS's one sanctioned admin gradient: a vertical sky→white
 * dissolve (--field-admin) that turns a flat sky field plus white cards back
 * into one continuous surface. Admin/warehouse routes only — seller screens
 * stay flat sky, per surfaces.css. It decides from usePathname() in a small
 * client wrapper; see protected-field.tsx for why there is no middleware.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  return <ProtectedField>{children}</ProtectedField>;
}
