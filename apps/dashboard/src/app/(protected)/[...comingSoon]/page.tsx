/**
 * Coming Soon — catch-all route.
 *
 * Any path without a real page yet lands here, fully themed. Building a real
 * page at that path automatically overrides this catch-all — no links to
 * update, ever.
 *
 * REWRITTEN off the archived Geist spec. What this page used to be was the
 * densest concentration of design-system drift in the app, and it sat on the
 * one route people reach by accident:
 *
 *   · three page-local @keyframes — the DS allows only the named gwp-* set
 *   · three size-96 blur-[120px] colour orbs — "random blob decorations" and
 *     "glassmorphism" are both on the DS's Generic-SaaS-drift list, and a
 *     translucent film over the page contradicts "surfaces are opaque"
 *   · a shimmering gradient headline — "heavy gradients", same list
 *   · a 24px neon drop-shadow on the mark — same list again
 *   · dark:hidden / dark:block variants, which have been dead since dark mode
 *     was forced off (AppProviders' forcedTheme="light")
 *   · /Geomatric/*.svg — the pre-rebrand mark, not GwpMark
 *
 * What replaces it is the DS's own way of making a page feel like GWP: sky
 * canvas, one Craft Cut into the shell, the real mark, and motion that is a
 * single named keyframe. Depth comes from a change of surface and the cut —
 * the two mechanisms the DS names — and from nothing else.
 */

"use client";

import { ArrowLeft, Hammer } from "lucide-react";

import { GwpMark } from "@/components/ds";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";

export default function ComingSoon() {
  const { t } = useTranslation();

  return (
    // min-h fills the viewport below the 60px navbar — footer only appears on
    // scroll. The ground is --surface-canvas straight from <body>.
    <main className="relative flex min-h-[calc(100svh-60px)] flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 py-20 text-center">
      {/* No Craft Cut. A cut marks the sky/cream boundary, and this page has
          no boundary: it is a centred full-height panel on sky with nothing
          after it, and the footer is signed-out-only so it never follows this
          protected route. A cut here would be a curve into a colour that
          begins nowhere. */}

      {/* tone="cream" because the mark sits on bright sky — the DS's colour
          rule for the logo, and the reason it is not the sky default here. */}
      <div className="relative motion-safe:animate-[gwp-rise_var(--dur-slow)_var(--ease-out)_both]">
        <GwpMark size={56} tone="cream" />
      </div>

      <Badge variant="secondary" className="relative gap-1.5">
        <Hammer className="size-3" aria-hidden />
        {t("comingSoon.badge")}
      </Badge>

      {/* Cream display ink, because the surface is saturated sky. A gradient
          headline is the generic-SaaS look the DS names by name. */}
      <h1 className="relative max-w-2xl font-display text-(length:--fs-display-lg) leading-(--lh-display) font-(--fw-display-heavy) tracking-(--ls-display) text-balance text-(--display-on-sky)">
        {t("comingSoon.title")}
      </h1>

      <p className="relative max-w-md text-(length:--fs-body-lg) text-balance text-(--text-on-sky-secondary)">
        {t("comingSoon.description")}
      </p>

      {/* The one moving thing on the page, and it says something: work is in
          progress. gwp-pulse is a named DS keyframe; motion-safe: is what
          honours prefers-reduced-motion, and a still row still reads. */}
      <div aria-hidden className="relative flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-(--action-500) motion-safe:animate-[gwp-pulse_1.4s_var(--ease-out)_infinite]"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>

      <div className="relative">
        <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          {t("comingSoon.back")}
        </Button>
      </div>
    </main>
  );
}
