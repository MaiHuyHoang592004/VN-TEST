/**
 * User Menu Component
 * Dropdown menu for authenticated users with profile, settings, and logout
 */

"use client";

import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { useLocaleRouter } from "@/lib/i18n/navigation";
import {
  User,
  Settings,
  CreditCard,
  HelpCircle,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/components/global/providers";
import { useTranslation } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const router = useLocaleRouter();
  const { user, signOut } = useAuth();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (!user) return null;

  const displayName = user.displayName || user.email?.split("@")[0] || "User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="border-border hover:border-foreground/20 hover:bg-accent/50 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" />
        }
      >
        <span className="max-w-[120px] truncate">{displayName}</span>
        <ChevronDown className="text-muted-foreground h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 dark:bg-black"
        align="end"
        sideOffset={8}
      >
        {/* Base UI: GroupLabel must live inside a Group */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm leading-none font-medium">{displayName}</p>
              <p className="text-muted-foreground text-xs leading-none">
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/profile" className="cursor-pointer" />}>
            <User className="mr-2 h-4 w-4" />
            <span>{t("nav.profile")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" className="cursor-pointer" />}>
            <Settings className="mr-2 h-4 w-4" />
            <span>{t("nav.settings")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/profile/billing" className="cursor-pointer" />}>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>{t("nav.billing")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/help" className="cursor-pointer" />}>
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>{t("nav.helpSupport")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t("nav.logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
