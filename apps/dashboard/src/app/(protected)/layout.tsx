import { redirect } from "next/navigation";
import { auth } from "@opcreative/auth";

/**
 * Every page in this group requires a session; signed-out visitors land on
 * "/" (the login screen). DB-session check runs server-side per request —
 * no proxy.ts needed (proxy can't share the Prisma client anyway).
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  return children;
}
