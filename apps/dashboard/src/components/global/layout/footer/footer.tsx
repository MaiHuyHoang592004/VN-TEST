/**
 * Footer Component
 * Clean Vercel-style footer: brand block + social, link columns by category,
 * bottom bar with copyright and theme toggle. Fully i18n'd.
 */

"use client";

import Image from "next/image";

import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";

import { FooterSocial } from "./footer-social";

export function Footer() {
  const { t } = useTranslation();

  const columns = [
    {
      heading: t("footer.product"),
      links: [
        { label: t("nav.orders"), href: "/orders" },
        { label: t("catalog.browse.title"), href: "/catalog" },
        { label: t("nav.wallet"), href: "/wallet" },
        { label: t("nav.analytics"), href: "/analytics" },
      ],
    },
    {
      heading: t("footer.company"),
      links: [
        { label: t("footer.about"), href: "/about" },
        { label: t("nav.helpSupport"), href: "/help" },
        { label: t("footer.contact"), href: "/contact" },
      ],
    },
    {
      heading: t("footer.legal"),
      links: [
        { label: t("footer.privacy"), href: "/privacy" },
        { label: t("footer.terms"), href: "/terms" },
      ],
    },
  ];

  return (
    <footer className="border-border border-t">
      <div className="mx-auto w-full max-w-6xl px-6 py-12 lg:px-8">
        {/* Top: brand + link columns */}
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          {/* Brand block */}
          <div className="flex max-w-xs flex-col gap-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Image
                src="/Geomatric/black.svg"
                alt=""
                width={22}
                height={24}
                className="block dark:hidden"
              />
              <Image
                src="/Geomatric/white.svg"
                alt=""
                width={22}
                height={24}
                className="hidden dark:block"
              />
              OpCreative
            </Link>
            <p className="text-muted-foreground text-sm">
              {t("footer.tagline")}
            </p>
            <FooterSocial />
          </div>

          {/* Link columns */}
          <nav
            aria-label={t("footer.navigation")}
            className="grid grid-cols-2 gap-8 sm:grid-cols-3"
          >
            {columns.map((row) => (
              <div key={row.heading} className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">{row.heading}</h3>
                <ul className="flex flex-col gap-2.5">
                  {row.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom bar: copyright */}
        <div className="border-border mt-10 border-t pt-6">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} OpCreative. {t("footer.rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
