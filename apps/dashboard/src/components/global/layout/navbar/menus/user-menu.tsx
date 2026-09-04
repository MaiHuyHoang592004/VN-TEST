/**
 * The avatar menu — the desktop half of the account nav.
 *
 * Sign out and the team picker used to live in the sheet's footer and header.
 * The sheet is now the MOBILE nav only, so on desktop this menu is the only
 * route to either, and it is also the design's third right-hand control:
 * bell · language · avatar ▾.
 *
 * Settings and Help & support were absent here for one turn, because both
 * routes fell to [...comingSoon] and a menu that mostly apologises is worse
 * than a short one. Both are real pages now, so they are back. Billing stays
 * gated: a designer or customer account has no wallet and would get a row that
 * only confuses.
 */

"use client";

import { CreditCard, HelpCircle, LogOut, Settings, User } from "lucide-react";

import { useAuth } from "@/components/global/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/use-permissions";
import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link, useLocaleRouter } from "@/lib/i18n/navigation";

import { TeamSwitcher } from "./team-switcher";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() || email?.split("@")[0] || "";
  if (!source) return "U";
  const parts = source.split(/\s+/);
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { can } = usePermissions();
  const { t } = useTranslation();
  const router = useLocaleRouter();

  if (!user) return null;

  const displayName = user.displayName || user.email?.split("@")[0] || "User";

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label={t("nav.account")}
            className="inline-flex h-9 items-center gap-2 rounded-(--radius-pill) py-0.5 pr-2 pl-0.5 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
          />
        }
      >
        <Avatar className="size-8 shrink-0">
          {user.photoURL ? <AvatarImage src={user.photoURL} alt={displayName} /> : null}
          <AvatarFallback className="bg-sky-200 text-(length:--fs-micro) font-semibold text-navy-700">
            {initials(user.displayName, user.email)}
          </AvatarFallback>
        </Avatar>
        {/* The name shows from lg up only. Below that the avatar alone keeps the
            right-hand cluster from pushing the nav items into a scroll. */}
        <span className="hidden max-w-[9rem] truncate font-sans text-(length:--fs-body-sm) font-semibold text-navy-700 lg:block">
          {displayName}
        </span>
      </DropdownMenuTrigger>

      {/* w-64: the team row carries a mark, a name, a plan badge and a chevron,
          and at 240px the name was the only flexible part, so it took the whole
          truncation. */}
      <DropdownMenuContent className="w-64 p-1.5" align="end" sideOffset={8}>
        <p className="truncate px-2.5 pt-1.5 pb-2 font-sans text-(length:--fs-micro) text-(--text-muted)">
          {user.email}
        </p>

        <div className="pb-1">
          <TeamSwitcher variant="row" />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/profile" />}>
          <User className="size-4 stroke-(--icon-default)" />
          <span>{t("nav.profile")}</span>
        </DropdownMenuItem>

        {can("transactions.read.own") && (
          <DropdownMenuItem render={<Link href="/profile/billing" />}>
            <CreditCard className="size-4 stroke-(--icon-default)" />
            <span>{t("nav.billing")}</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="size-4 stroke-(--icon-default)" />
          <span>{t("nav.settings")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/help" />}>
          <HelpCircle className="size-4 stroke-(--icon-default)" />
          <span>{t("nav.helpSupport")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* The one destructive row in the nav, in the critical tone the DS
            reserves for it. */}
        <DropdownMenuItem
          onClick={() => void handleSignOut()}
          className="text-(--status-critical-fg) focus:bg-(--status-critical-bg) focus:text-(--status-critical-fg)"
        >
          <LogOut className="size-4 stroke-(--status-critical-fg)" />
          <span>{t("nav.logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
