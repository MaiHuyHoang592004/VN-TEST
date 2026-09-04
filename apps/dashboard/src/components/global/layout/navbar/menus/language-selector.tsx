/**
 * Language Selector Component
 * Dropdown with country flags for language selection
 * Connected to i18n context for global language switching
 *
 * Built on the app's DropdownMenu (Base UI) like tools-dropdown and
 * workspace-dropdown, NOT a hand-rolled popover. The primitive is what supplies
 * Escape-to-close, aria-haspopup on the trigger, focus moved into the list on
 * open and restored to the trigger on close — and, through the radio group,
 * role="menuitemradio" with aria-checked, so the selected language is announced
 * instead of being conveyed by a tinted row alone.
 */

"use client";

import { ChevronDown } from "lucide-react";
import { useI18n, useTranslation, type Locale } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageSelector() {
  const { locale, setLocale, languages } = useI18n();
  const { t } = useTranslation();

  // Find current language object
  const selectedLang = languages.find((l) => l.code === locale) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t("nav.language")}
            className="group flex h-9 items-center gap-1.5 rounded-(--radius-pill) px-2.5 text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
          />
        }
      >
        <span aria-hidden="true" className="text-lg leading-none">
          {selectedLang.flag}
        </span>
        <span className="hidden font-sans text-(length:--fs-body-sm) font-semibold sm:inline">
          {selectedLang.code.toUpperCase()}
        </span>
        {/* base-ui sets data-popup-open on the trigger (radix used data-state=open) */}
        <ChevronDown
          aria-hidden="true"
          className="h-3.5 w-3.5 opacity-60 transition-transform duration-(--dur-fast) group-data-popup-open:rotate-180 motion-reduce:transition-none"
        />
      </DropdownMenuTrigger>

      {/* w-auto: the content's default width is the ANCHOR's, and this anchor
          is a 60px pill. */}
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-auto min-w-[200px] p-1.5"
      >
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => setLocale(value as Locale)}
        >
          {languages.map((lang) => (
            <DropdownMenuRadioItem
              key={lang.code}
              value={lang.code}
              className="gap-3 px-2.5 py-2"
            >
              <span aria-hidden="true" className="text-xl">
                {lang.flag}
              </span>
              <span className="flex flex-col">
                <span className="font-sans text-(length:--fs-body-sm) font-semibold text-navy-700">
                  {lang.nativeName}
                </span>
                <span className="font-sans text-(length:--fs-micro) text-(--text-muted)">
                  {lang.name}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
