"use client";

/**
 * Phone field with a country picker: flag + dial code in a searchable
 * dropdown, national number beside it. Emits ONE string upward — E.164
 * (+84912345678) — so the form, schema and database never learn the control
 * grew two halves.
 *
 * The group is hand-rolled to the Geist recipe (DESIGN-VERCEL.md appendix)
 * rather than built on InputGroup: 40px control, 6px radius, translucent
 * border, and focus as the two-layer ring on the WHOLE group when the number
 * field owns focus. InputGroup's has-focus treatment is the single
 * `ring-3 ring-ring/50` the spec explicitly forbids, which is how the last
 * version earned its square-cornered focus.
 *
 * No hand-written country data anywhere: ISO codes and dial codes come from
 * libphonenumber-js, names from Intl.DisplayNames in the viewer's own locale
 * (all 7 UI locales supported natively), and the flag is computed from the
 * ISO code's regional-indicator pair. ponytail: emoji flags render as plain
 * "US" letters on Windows Chrome — swap to country-flag-icons SVGs if that
 * audience ever matters.
 */

import { useMemo, useRef, useState } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { ChevronDown } from "lucide-react";

import { useI18n, useTranslation } from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** 🇺 is 'U' + 127397 — a flag is just the two regional-indicator letters. */
const flagOf = (iso: string) =>
  String.fromCodePoint(...[...iso].map((c) => 127397 + c.charCodeAt(0)));

/** "Việt Nam" → "Viet Nam", so ascii typing still finds it. */
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

/** The browser's region (vi-VN → VN) when it names a real country, else US. */
function guessCountry(): CountryCode {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && (getCountries() as string[]).includes(region)) {
      return region as CountryCode;
    }
  } catch {
    // an exotic navigator.language is not worth breaking the form over
  }
  return "US";
}

export function PhoneInput({
  value,
  onChange,
  ...fieldProps
}: {
  value: string;
  onChange: (v: string) => void;
  /** FormField's wiring: id, aria-describedby, aria-invalid. */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const { t } = useTranslation();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const numberRef = useRef<HTMLInputElement>(null);

  // Split the stored string once on mount. A legacy column may hold bare local
  // digits with no +country — those land in the number box under the guessed
  // country rather than being thrown away.
  const [country, setCountry] = useState<CountryCode>(() => {
    return (value && parsePhoneNumberFromString(value)?.country) || guessCountry();
  });
  const [national, setNational] = useState<string>(() => {
    const parsed = value ? parsePhoneNumberFromString(value) : undefined;
    return parsed ? parsed.nationalNumber : value.replace(/[^0-9]/g, "");
  });

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    // English names ride along as search keywords, so "vietnam" still finds
    // 越南 while the UI is in Chinese.
    const english = new Intl.DisplayNames(["en"], { type: "region" });
    return getCountries()
      .map((iso) => {
        const name = names.of(iso) ?? iso;
        return {
          iso,
          name,
          code: getCountryCallingCode(iso),
          keywords: [fold(name), english.of(iso) ?? "", iso],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  const emit = (c: CountryCode, digits: string) =>
    onChange(digits ? `+${getCountryCallingCode(c)}${digits}` : "");

  const pick = (iso: CountryCode) => {
    setCountry(iso);
    emit(iso, national);
    setOpen(false);
    numberRef.current?.focus();
  };

  const countryName = countries.find((c) => c.iso === country)?.name ?? country;

  return (
    // Geist control recipe: 40px, 6px radius, translucent border, and focus
    // as the two-layer ring on the whole group — the number field inside is
    // naked, so there is exactly ONE border and ONE ring however it's focused.
    <div className="border-input flex h-10 w-full items-center rounded-sm border bg-transparent transition-colors has-[[data-slot=phone-number]:focus-visible]:ring-2 has-[[data-slot=phone-number]:focus-visible]:ring-ring has-[[data-slot=phone-number]:focus-visible]:ring-offset-2 has-[[data-slot=phone-number]:focus-visible]:ring-offset-background has-[[data-slot=phone-number][aria-invalid=true]]:border-destructive has-[[data-slot=phone-number]:disabled]:opacity-50 dark:bg-input/30">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={countryName}
              // rounded-s-[5px]: the 6px outer radius minus the 1px border,
              // so the hover fill hugs the corner instead of clipping it.
              className="hover:bg-accent/50 flex h-full shrink-0 items-center gap-1.5 rounded-s-[5px] px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          }
        >
          <span className="text-base leading-none">{flagOf(country)}</span>
          {/* Same text-sm as the number being typed beside it — a smaller
              dial code read as a different control. */}
          <span dir="ltr" className="text-muted-foreground tabular-nums">
            +{getCountryCallingCode(country)}
          </span>
          <ChevronDown className="text-muted-foreground size-3.5" />
        </PopoverTrigger>

        {/* Menu tier per spec: rounded-lg + shadow-ds-4 (PopoverContent's
            defaults), black in dark like every other menu here. Command wants
            to be a rounded-xl dialog panel — flattened to inherit instead. */}
        <PopoverContent
          align="start"
          sideOffset={10}
          className="w-72 overflow-hidden p-0 dark:bg-black"
        >
          <Command className="rounded-lg! bg-transparent">
            <CommandInput placeholder={t("profile.form.searchCountry")} />
            <CommandList>
              <CommandEmpty>{t("profile.form.noCountry")}</CommandEmpty>
              {countries.map(({ iso, name, code, keywords }) => (
                <CommandItem
                  key={iso}
                  value={`${name} +${code}`}
                  keywords={keywords}
                  // CommandItem renders its own trailing check for this.
                  data-checked={iso === country}
                  onSelect={() => pick(iso)}
                >
                  <span className="text-base leading-none">{flagOf(iso)}</span>
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span dir="ltr" className="text-muted-foreground text-xs tabular-nums">
                    +{code}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Hairline between the two halves — vercel.com's own compound inputs. */}
      <span aria-hidden="true" className="bg-border h-5 w-px shrink-0" />

      <input
        {...fieldProps}
        ref={numberRef}
        data-slot="phone-number"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className="placeholder:text-muted-foreground h-full w-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none disabled:cursor-not-allowed"
        value={national}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          setNational(digits);
          emit(country, digits);
        }}
      />
    </div>
  );
}
