/**
 * Workspace ▾ — the internal sections, on the top nav.
 *
 * Seventeen staff routes (Fulfillment ×3, Inventory ×3, Admin ×11) used to be
 * reachable only by opening the sheet. The shell is now the nav, so they need a
 * home ON it — and seventeen inline items is not a nav bar, it is a list. One
 * grouped menu, three headings, is the overflow mechanism the DS already uses
 * for Tools.
 *
 * A SELLER holds none of these permissions, so `groups` comes back empty and
 * the whole trigger disappears — the seller's bar is Home · Orders · Products ·
 * Tickets · Tools, exactly the design's Seller Nav, with nothing greyed out.
 * Hiding is cosmetics: every page still calls requirePermission.
 *
 * Routes and icons come from config/nav-tabs.ts + config/nav-icons.ts, the same
 * two modules the sheet reads, so the two navs cannot drift apart.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { WORKSPACE_SECTIONS, sectionNav } from "@/config/nav-icons";
import { activeHref } from "@/config/nav-tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceDropdown() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // A fast route change can unmount this between the leave and the timer, and
  // the pending setOpen then fires on a dead component.
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const groups = WORKSPACE_SECTIONS.map(({ prefix, titleKey }) => ({
    titleKey,
    items: sectionNav(prefix).filter((item) => !item.permission || can(item.permission)),
  })).filter((group) => group.items.length > 0);

  // Ask the LIST which route is active, never each item: on /inventory/receipts
  // both /inventory and /inventory/receipts answer yes on their own.
  const active = activeHref(
    pathname,
    groups.flatMap((g) => g.items.map((i) => i.href))
  );

  if (groups.length === 0) return null;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <button
              // aria-current, not a fill: the trigger is not itself a
              // destination, so it takes the passive treatment even while you
              // are inside one of its routes — the lit item is in the panel.
              className="group inline-flex h-9 items-center gap-1 rounded-(--radius-pill) px-3 font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none data-popup-open:bg-sky-100 data-popup-open:text-navy-700 motion-reduce:transition-none"
            />
          }
        >
          <span>{t("nav.workspace")}</span>
          {/* base-ui sets data-popup-open on the trigger (radix used data-state) */}
          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-(--dur-fast) group-data-popup-open:rotate-180" />
        </DropdownMenuTrigger>

        {/* Three groups of short rows: a wide two-line row per item would make
            this eleven paragraphs tall. Tools gets descriptions because it has
            two items; this one gets a scannable column. */}
        <DropdownMenuContent className="min-w-[236px] p-1.5" align="start" sideOffset={8}>
          {groups.map((group, i) => (
            <DropdownMenuGroup key={group.titleKey}>
              {i > 0 && <DropdownMenuSeparator />}
              <p className="px-2.5 pt-2 pb-1 font-sans text-(length:--fs-micro) font-semibold tracking-(--ls-caps) text-(--text-label) uppercase">
                {t(group.titleKey)}
              </p>
              {group.items.map(({ key, href, icon: Icon }) => (
                <DropdownMenuItem
                  key={href}
                  className="p-0 focus:bg-transparent"
                  render={
                    <Link
                      href={href}
                      aria-current={href === active ? "page" : undefined}
                      className="group/item flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors aria-[current=page]:bg-sky-200"
                    />
                  }
                >
                  {/* Colour the glyph with stroke-*, which the item's own
                      focus:**:text-accent-foreground rule never touches — no
                      specificity fight and no !important. */}
                  <Icon className="h-4 w-4 shrink-0 stroke-(--icon-default) transition-colors group-data-[highlighted]/item:stroke-navy-700" />
                  <span className="font-sans text-(length:--fs-body-sm) font-semibold text-navy-700">
                    {t(key)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
