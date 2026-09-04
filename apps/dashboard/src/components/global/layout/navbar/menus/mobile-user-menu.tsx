/**
 * Mobile User Menu Component
 * Bottom sheet style menu for authenticated users on mobile
 */

"use client";

import { useState } from "react";
import { useLocaleRouter } from "@/lib/i18n/navigation";
import { User, Settings, HelpCircle, LogOut, X } from "lucide-react";
import { useAuth } from "@/components/global/providers";
import { useTranslation } from "@/lib/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

function getInitials(name: string | null | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function MobileUserMenu() {
  const router = useLocaleRouter();
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    router.push("/");
  };

  const handleNavigation = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!user) return null;

  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const initials = getInitials(user.displayName);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={
          <button
            aria-label={t("nav.profile")}
            className="inline-flex size-10 items-center justify-center rounded-(--radius-pill) text-navy-500 transition-colors duration-(--dur-fast) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
          />
        }
      >
        <Avatar className="size-6">
          <AvatarImage src={user.photoURL || undefined} alt={displayName} />
          <AvatarFallback className="bg-sky-200 text-(length:--fs-micro) font-semibold text-navy-700">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="border-b border-(--border-hairline) pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={user.photoURL || undefined}
                  alt={displayName}
                />
                <AvatarFallback className="bg-sky-200 text-(length:--fs-body-lg) font-semibold text-navy-700">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <DrawerTitle className="text-(length:--fs-body-lg)">
                  {displayName}
                </DrawerTitle>
                <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
                  {user.email}
                </p>
              </div>
            </div>
            <DrawerClose
              render={
                <button className="rounded-(--radius-pill) p-2 text-(--icon-muted) transition-colors duration-(--dur-fast) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none" />
              }
            >
              <X className="h-5 w-5" />
            </DrawerClose>
          </div>
        </DrawerHeader>
        {/* This list was cut to /profile alone while /settings and /help fell
            to the coming-soon page — a menu that mostly apologises is worse
            than a short one. Both are real pages now, so both are back.
            Billing is deliberately still absent: /profile is a real section
            with its own tab column (security, API, webhooks, billing), so the
            one link opens all of it, and a phone has no room for the same
            destination twice. */}
        <div className="px-4 py-2">
          <nav className="space-y-1">
            {[
              { href: "/profile", icon: User, key: "nav.profile" },
              { href: "/settings", icon: Settings, key: "nav.settings" },
              { href: "/help", icon: HelpCircle, key: "nav.helpSupport" },
            ].map(({ href, icon: Icon, key }) => (
              <button
                key={href}
                onClick={() => handleNavigation(href)}
                className="flex w-full items-center gap-3 rounded-(--radius-card) px-3 py-3 font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
              >
                <Icon className="h-5 w-5" />
                <span>{t(key)}</span>
              </button>
            ))}
          </nav>
          <div className="mt-4 border-t border-(--border-hairline) pt-4">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-(--radius-card) px-3 py-3 font-sans text-(length:--fs-body) font-semibold text-(--status-critical-fg) transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-(--status-critical-bg) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
            >
              <LogOut className="h-5 w-5" />
              <span>{t("nav.logout")}</span>
            </button>
          </div>
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-8" />
      </DrawerContent>
    </Drawer>
  );
}
