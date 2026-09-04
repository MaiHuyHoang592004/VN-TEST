/**
 * Language Selector Component
 * Dropdown with country flags for language selection
 * Connected to i18n context for global language switching
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";

export function LanguageSelector() {
  const { locale, setLocale, languages } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find current language object
  const selectedLang = languages.find((l) => l.code === locale) || languages[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (langCode: Locale) => {
    setLocale(langCode);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 items-center gap-1.5 rounded-(--radius-pill) px-2.5 text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
        aria-label="Select language"
        aria-expanded={isOpen}
      >
        <span className="text-lg leading-none">{selectedLang.flag}</span>
        <span className="hidden font-sans text-(length:--fs-body-sm) font-semibold sm:inline">
          {selectedLang.code.toUpperCase()}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-60 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 z-50 mt-2 min-w-[180px] overflow-hidden rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-raised) shadow-(--shadow-md)">
          <div className="py-1.5">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-navy-700 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 focus-visible:bg-sky-100 focus-visible:outline-none motion-reduce:transition-none ${
                  locale === lang.code ? "bg-sky-200" : ""
                }`}
              >
                <span className="text-xl">{lang.flag}</span>
                <div className="flex flex-col">
                  <span className="font-sans text-(length:--fs-body-sm) font-semibold">
                    {lang.nativeName}
                  </span>
                  <span className="font-sans text-(length:--fs-micro) text-(--text-muted)">
                    {lang.name}
                  </span>
                </div>
                {locale === lang.code && (
                  <svg
                    className="ml-auto h-4 w-4 text-navy-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
