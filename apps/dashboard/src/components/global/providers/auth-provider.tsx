/**
 * Auth context.
 * The server root layout resolves the Auth.js session and passes the mapped
 * user down; this context just distributes it (same shape the navbar/user-menu
 * always expected). signOut posts to /api/auth/signout and lands on /login.
 */

"use client";

import { createContext, useContext, type ReactNode } from "react";
import { signOut as nextAuthSignOut } from "next-auth/react";
import type { UserRole } from "@gwprint/shared";

export interface AuthUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  /** Drives which nav tabs and buttons are shown. Cosmetics only — every
   * server action re-checks permissions itself. */
  roles: UserRole[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  signOut: async () => {},
});

export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser | null;
  children: ReactNode;
}) {
  const signOut = async () => {
    await nextAuthSignOut({ redirectTo: "/login" });
  };

  return (
    <AuthContext.Provider value={{ user, loading: false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
