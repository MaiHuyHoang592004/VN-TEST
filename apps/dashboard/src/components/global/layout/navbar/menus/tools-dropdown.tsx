/**
 * Tools Dropdown Component
 * Vercel-style hover dropdown for Analytics and Query Builder pages
 */

"use client";

import { useState, useRef } from "react";
import { ChevronDown, LineChart, Wallet } from "lucide-react";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";

export function ToolsDropdown() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
            <button className="text-muted-foreground hover:text-foreground after:bg-foreground group relative flex items-center gap-1 rounded-sm text-sm font-medium transition-colors after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:transition-all after:duration-150 hover:after:w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" />
          }
        >
          <span>{t("nav.tools.label")}</span>
          {/* base-ui sets data-popup-open on the trigger (radix used data-state=open) */}
          <ChevronDown className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5 transition-transform duration-150 group-data-popup-open:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-[220px] p-1.5 dark:bg-black"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuItem
            className="p-0 focus:bg-transparent"
            render={
              <Link
                href="/analytics"
                className="group/item flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors"
              />
            }
          >
            {/* Vercel-style neon icon: brand color + glow on highlight. Colored via stroke (not text color), which the base item's focus:** color rule never touches — no specificity fight, no !important */}
            <div className="border-border bg-background group-data-[highlighted]/item:border-action-500/50 group-data-[highlighted]/item:bg-action-500/10 group-data-[highlighted]/item:shadow-lg group-data-[highlighted]/item:shadow-action-500/25 flex h-8 w-8 items-center justify-center rounded-md border transition-all duration-200">
              <LineChart className="stroke-muted-foreground group-data-[highlighted]/item:stroke-action-500 h-4 w-4 transition-colors" />
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground group-data-[highlighted]/item:text-foreground text-sm font-medium transition-colors">
                {t("nav.tools.analytics")}
              </span>
              <span className="text-muted-foreground/70 text-xs">
                {t("nav.tools.analyticsDescription")}
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="p-0 focus:bg-transparent"
            render={
              <Link
                href="/wallet"
                className="group/item flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors"
              />
            }
          >
            <div className="border-border bg-background group-data-[highlighted]/item:border-sky-500/50 group-data-[highlighted]/item:bg-sky-500/10 group-data-[highlighted]/item:shadow-lg group-data-[highlighted]/item:shadow-sky-500/25 flex h-8 w-8 items-center justify-center rounded-md border transition-all duration-200">
              <Wallet className="stroke-muted-foreground group-data-[highlighted]/item:stroke-sky-500 h-4 w-4 transition-colors" />
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground group-data-[highlighted]/item:text-foreground text-sm font-medium transition-colors">
                {t("nav.tools.wallet")}
              </span>
              <span className="text-muted-foreground/70 text-xs">
                {t("nav.tools.walletDescription")}
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
