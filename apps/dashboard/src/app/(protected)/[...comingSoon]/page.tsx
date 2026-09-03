/**
 * Coming Soon — catch-all route.
 * Any path without a real page yet (/orders, /products, /wallet, footer links…)
 * lands here, fully themed. Building a real page at that path automatically
 * overrides this catch-all — no links to update, ever.
 *
 * Design: aurora orbs + grid backdrop, floating logo cube, shimmering gradient
 * title, staggered entrances, bouncing "building" dots. Self-contained.
 */

"use client";

import Image from "next/image";
import { ArrowLeft, Hammer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";

export default function ComingSoon() {
  const { t } = useTranslation();

  return (
    // min-h fills the viewport below the 60px navbar — footer only appears on scroll
    <main className="relative flex min-h-[calc(100svh-60px)] flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 py-20 text-center">
      {/* page-local keyframes */}
      <style>{`
        @keyframes cs-float {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-14px) rotate(3deg); }
        }
        @keyframes cs-shimmer {
          0% { background-position: 200% 50%; }
          100% { background-position: -200% 50%; }
        }
        @keyframes cs-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -30px) scale(1.1); }
          66% { transform: translate(-30px, 20px) scale(0.95); }
        }
      `}</style>

      {/* themed grid backdrop, same as the home hero */}
      <div aria-hidden className="grid-bg radial-fade absolute inset-0 -z-20" />

      {/* aurora orbs — brand colors, slow drift */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
        <div
          className="bg-vercel-blue/25 absolute -top-24 left-1/4 size-96 rounded-full blur-[120px]"
          style={{ animation: "cs-drift 14s ease-in-out infinite" }}
        />
        <div
          className="bg-vercel-purple/20 absolute top-1/3 -right-24 size-96 rounded-full blur-[120px]"
          style={{ animation: "cs-drift 18s ease-in-out infinite reverse" }}
        />
        <div
          className="bg-vercel-pink/15 absolute -bottom-32 left-1/3 size-96 rounded-full blur-[120px]"
          style={{ animation: "cs-drift 16s ease-in-out infinite", animationDelay: "-6s" }}
        />
      </div>

      {/* floating logo cube with glow */}
      <div className="animate-in fade-in zoom-in-75 fill-mode-both relative duration-700">
        <div
          className="drop-shadow-[0_0_24px_var(--vercel-blue)]"
          style={{ animation: "cs-float 6s ease-in-out infinite" }}
        >
          <Image
            src="/Geomatric/black.svg"
            alt=""
            width={56}
            height={60}
            className="block dark:hidden"
            priority
          />
          <Image
            src="/Geomatric/white.svg"
            alt=""
            width={56}
            height={60}
            className="hidden dark:block"
            priority
          />
        </div>
      </div>

      <Badge
        product="secondary"
        className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both gap-1.5 delay-100 duration-500"
      >
        <Hammer className="size-3" />
        {t("comingSoon.badge")}
      </Badge>

      {/* shimmering gradient title */}
      <h1
        className="max-w-2xl bg-clip-text text-4xl font-semibold tracking-tighter text-balance text-transparent sm:text-5xl lg:text-7xl"
        style={{
          backgroundImage:
            "linear-gradient(110deg, var(--vercel-blue), var(--vercel-purple) 30%, var(--vercel-pink) 50%, var(--vercel-purple) 70%, var(--vercel-blue))",
          backgroundSize: "200% auto",
          animation: "cs-shimmer 5s linear infinite",
        }}
      >
        {t("comingSoon.title")}
      </h1>

      <p className="text-muted-foreground animate-in fade-in slide-in-from-bottom-3 fill-mode-both max-w-md text-base text-balance delay-200 sm:text-lg duration-500">
        {t("comingSoon.description")}
      </p>

      {/* bouncing "building" dots */}
      <div
        aria-hidden
        className="animate-in fade-in fill-mode-both flex items-center gap-1.5 delay-300 duration-500"
      >
        <span className="bg-vercel-blue size-1.5 animate-bounce rounded-full" />
        <span className="bg-vercel-purple size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
        <span className="bg-vercel-pink size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both delay-400 duration-500">
        <Button
          size="lg"
          product="outline"
          className="hover-lift"
          nativeButton={false}
          render={<Link href="/" />}
        >
          <ArrowLeft data-icon="inline-start" />
          {t("comingSoon.back")}
        </Button>
      </div>
    </main>
  );
}
