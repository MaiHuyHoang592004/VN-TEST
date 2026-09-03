/**
 * Mobile User Menu Component
 * Bottom sheet style menu for authenticated users on mobile
 */

"use client";

import { useState } from "react";
import { useLocaleRouter } from "@/lib/i18n/navigation";
import { User, LogOut, X } from "lucide-react";
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
          <button aria-label={t("nav.profile")} className="text-muted-foreground hover:bg-accent/60 hover:text-foreground inline-flex size-10 items-center justify-center rounded-full transition-colors" />
        }
      >
        <Avatar className="size-6">
          <AvatarImage src={user.photoURL || undefined} alt={displayName} />
          <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={user.photoURL || undefined}
                  alt={displayName}
                />
                <AvatarFallback className="bg-primary text-primary-foreground text-lg font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <DrawerTitle className="text-base">{displayName}</DrawerTitle>
                <p className="text-muted-foreground text-sm">{user.email}</p>
              </div>
            </div>
            <DrawerClose
              render={
                <button className="text-muted-foreground hover:text-foreground rounded-full p-2 transition-colors" />
              }
            >
              <X className="h-5 w-5" />
            </DrawerClose>
          </div>
        </DrawerHeader>
        {/* Profile only, and that is not a gap. /settings, /billing and /help
            were three of the four links here and all three land on the
            coming-soon page — a menu that mostly apologises is worse than a
            short one. /profile is a real section with its own tab column
            (security, API, webhooks, billing), so the one link opens all of
            it. Add rows back here as those routes actually ship. */}
        <div className="px-4 py-2">
          <nav className="space-y-1">
            <button
              onClick={() => handleNavigation("/profile")}
              className="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors"
            >
              <User className="h-5 w-5" />
              <span>{t("nav.profile")}</span>
            </button>
          </nav>
          <div className="mt-4 border-t pt-4">
            <button
              onClick={handleSignOut}
              className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors"
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
