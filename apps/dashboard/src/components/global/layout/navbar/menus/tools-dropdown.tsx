/**
 * Tools Dropdown Component
 * Hover dropdown for Analytics and Wallet, in the nav's own item treatment.
 */

"use client";

import { useEffect, useRef, useState } from "react";
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

  // A fast route change can unmount this between the leave and the timer, and
  // the pending setOpen then fires on a dead component.
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

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
            <button className="group inline-flex h-9 items-center gap-1 rounded-(--radius-pill) px-3 font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none" />
          }
        >
          <span>{t("nav.tools.label")}</span>
          {/* base-ui sets data-popup-open on the trigger (radix used data-state=open) */}
          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-(--dur-fast) group-data-popup-open:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-[220px] p-1.5"
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
            <div className="flex h-8 w-8 items-center justify-center rounded-(--radius-sm) border border-(--border-hairline) bg-(--surface-data) transition-colors duration-(--dur-fast) group-data-[highlighted]/item:border-transparent group-data-[highlighted]/item:bg-sky-100">
              <LineChart className="h-4 w-4 stroke-(--icon-default) transition-colors group-data-[highlighted]/item:stroke-navy-700" />
            </div>
            <div className="flex flex-col">
              <span className="font-sans text-(length:--fs-body-sm) font-semibold text-navy-700 transition-colors">
                {t("nav.tools.analytics")}
              </span>
              <span className="font-sans text-(length:--fs-micro) text-(--text-muted)">
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
            <div className="flex h-8 w-8 items-center justify-center rounded-(--radius-sm) border border-(--border-hairline) bg-(--surface-data) transition-colors duration-(--dur-fast) group-data-[highlighted]/item:border-transparent group-data-[highlighted]/item:bg-sky-100">
              <Wallet className="h-4 w-4 stroke-(--icon-default) transition-colors group-data-[highlighted]/item:stroke-navy-700" />
            </div>
            <div className="flex flex-col">
              <span className="font-sans text-(length:--fs-body-sm) font-semibold text-navy-700 transition-colors">
                {t("nav.tools.wallet")}
              </span>
              <span className="font-sans text-(length:--fs-micro) text-(--text-muted)">
                {t("nav.tools.walletDescription")}
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
