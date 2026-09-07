/**
 * Minimal i18n: React context + dot-path t() lookup.
 * Locale persists in localStorage; strings live in translations.ts.
 *
 * ponytail: no URL-locale routing (/en/...) — context-only switching.
 * Upgrade to [locale] segments + middleware if the storefront needs SEO’d locales.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { translations } from "./translations";

export type Locale = keyof typeof translations;

export interface Language {
  code: Locale;
  name: string;
  nativeName: string;
  flag: string;
}

export const languages: Language[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
];

const STORAGE_KEY = "locale";
const DEFAULT_LOCALE: Locale = "en";

/** `storage` only fires in OTHER tabs, so same-tab switches need their own
 * notification for useSyncExternalStore to pick them up. */
const LOCALE_EVENT = "gwprint:locale";

function subscribeLocale(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCALE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCALE_EVENT, onChange);
  };
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  languages: Language[];
  t: (key: string, vars?: TranslationVars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Values substituted into a string's `{placeholders}`. */
export type TranslationVars = Record<string, string | number>;

/**
 * Fills `{name}` placeholders.
 *
 * Needed because a rule sentence carries a number ("Tối đa 64 ký tự") and the
 * number does NOT sit in the same place in every language — Japanese puts it
 * first, Arabic reads right to left. Concatenating in JS would hard-code
 * English word order into all seven locales; only the translator can decide
 * where the placeholder goes.
 *
 * An unmatched placeholder is left verbatim rather than blanked, so a missing
 * variable shows up as `{max}` on screen instead of a sentence that silently
 * lost its number.
 */
function interpolate(text: string, vars?: TranslationVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

function lookup(locale: Locale, key: string): string | undefined {
  let node: unknown = translations[locale];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function I18nProvider({
  children,
  /** The signed-in user's saved language, carried in the session. Used when
   * this browser has no stored choice — that's what makes the preference
   * follow someone to a new machine. */
  accountLocale,
  onPersist,
}: {
  children: ReactNode;
  accountLocale?: string;
  /** Save the choice to the signed-in account. Omitted when signed out. */
  onPersist?: (locale: Locale) => void;
}) {
  // Read the saved locale as external state instead of copying it into
  // useState from an effect: that rendered every page twice on load and
  // flashed English before the real locale appeared.
  const stored = useSyncExternalStore(
    subscribeLocale,
    () => window.localStorage.getItem(STORAGE_KEY),
    () => null, // server: always the default
  );
  // localStorage FIRST: it holds the most recent explicit choice, and
  // setLocale also persists to the account, so the two agree. Reversing this
  // made the navbar language picker do nothing for signed-in users — the
  // session value (up to 60s stale) kept overriding the click.
  const preferred = stored ?? accountLocale;
  const locale: Locale =
    preferred && preferred in translations
      ? (preferred as Locale)
      : DEFAULT_LOCALE;

  // A DOM side effect (not state), so it stays an effect quite correctly.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      // Stored as a bare string, matching what earlier versions wrote —
      // reusing the JSON-based useLocalStorage would reset everyone's language
      // once.
      window.localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new Event(LOCALE_EVENT));
      // Persist to the account so the choice follows the person to another
      // device. Fire-and-forget: the UI has already switched, and a failed
      // write shouldn't block or undo that.
      void onPersist?.(next);
    },
    [onPersist],
  );

  // Fall back to English, then to the key itself (visible = easy to spot).
  const t = useCallback(
    (key: string, vars?: TranslationVars) =>
      interpolate(lookup(locale, key) ?? lookup("en", key) ?? key, vars),
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, languages, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** t() plus the current locale and a setter — the profile's language picker
 * needs to switch the running app, not just persist a value. */
export function useTranslation(): Pick<
  I18nContextValue,
  "t" | "locale" | "setLocale"
> {
  const { t, locale, setLocale } = useI18n();
  return { t, locale, setLocale };
}
