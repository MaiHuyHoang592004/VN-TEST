/**
 * The signed-out marketing footer: a cream ground with navy ink, crossed into
 * from the sky canvas by a CraftCut so the boundary is a cut rather than a
 * rule (DS rule 2). Rendered only when there is no session (root layout).
 */

"use client";

import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { CraftCut, GwpMark } from "@/components/ds";

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
    <footer className="bg-(--surface-content) text-navy-700">
      {/* The one sanctioned way across the sky/cream boundary. */}
      <CraftCut
        from="var(--surface-canvas)"
        to="var(--surface-content)"
      />
      <div className="mx-auto w-full max-w-6xl px-6 py-12 lg:px-8">
        {/* Top: brand + link columns */}
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          {/* Brand block */}
          <div className="flex max-w-xs flex-col gap-4">
            <Link
              href="/"
              aria-label="GoodWoodPrint"
              className="flex items-center rounded-(--radius-pill) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none"
            >
              <GwpMark size={24} tone="sky" />
            </Link>
            <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
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
                <h3 className="font-sans text-(length:--fs-micro) font-semibold tracking-(--ls-label) text-(--text-label) uppercase">
                  {row.heading}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {row.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="rounded-(--radius-pill) font-sans text-(length:--fs-body-sm) text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
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
        <div className="mt-10 border-t border-(--border-hairline) pt-6">
          <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
            © {new Date().getFullYear()} GWPrint. {t("footer.rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
