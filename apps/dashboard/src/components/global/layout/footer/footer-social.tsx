/**
 * Footer Social Component
 * Full social/contact icon set. Brand icons from Simple Icons
 * (@icons-pack/react-simple-icons) — lucide deprecated its brand icons.
 * LinkedIn was removed from Simple Icons (brand policy), so it and the
 * generic email glyph come from lucide.
 *
 * Neon hover: each icon glows in its platform's brand color via a
 * per-link --brand CSS variable (text + drop-shadow + lift).
 */

"use client";

import type { CSSProperties, ComponentType } from "react";
import { Mail } from "lucide-react";
import {
  SiDiscord,
  SiFacebook,
  SiInstagram,
  SiLine,
  SiMessenger,
  SiPinterest,
  SiReddit,
  SiSnapchat,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiWechat,
  SiWhatsapp,
  SiX,
  SiYoutube,
  SiZalo,
} from "@icons-pack/react-simple-icons";

/** LinkedIn was removed from both Simple Icons and lucide (brand policy) — inlined glyph */
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

interface SocialLink {
  label: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  /** Platform brand color — used for the neon hover glow */
  brand: string;
}

const SOCIAL_LINKS: SocialLink[] = [
  { label: "Instagram", href: "https://instagram.com/gwprint", Icon: SiInstagram, brand: "#E4405F" },
  { label: "Facebook", href: "https://facebook.com/gwprint", Icon: SiFacebook, brand: "#0866FF" },
  { label: "Messenger", href: "https://m.me/gwprint", Icon: SiMessenger, brand: "#00B2FF" },
  { label: "X (Twitter)", href: "https://x.com/gwprint", Icon: SiX, brand: "var(--foreground)" },
  { label: "Threads", href: "https://threads.net/@gwprint", Icon: SiThreads, brand: "var(--foreground)" },
  { label: "YouTube", href: "https://youtube.com/@gwprint", Icon: SiYoutube, brand: "#FF0000" },
  { label: "TikTok", href: "https://tiktok.com/@gwprint", Icon: SiTiktok, brand: "#00F2EA" },
  { label: "Pinterest", href: "https://pinterest.com/gwprint", Icon: SiPinterest, brand: "#BD081C" },
  { label: "Snapchat", href: "https://snapchat.com/add/gwprint", Icon: SiSnapchat, brand: "#FFFC00" },
  { label: "WhatsApp", href: "https://wa.me/1234567890", Icon: SiWhatsapp, brand: "#25D366" },
  { label: "Zalo", href: "https://zalo.me/gwprint", Icon: SiZalo, brand: "#005AE0" },
  { label: "Telegram", href: "https://t.me/gwprint", Icon: SiTelegram, brand: "#26A5E4" },
  { label: "WeChat", href: "https://weixin.qq.com", Icon: SiWechat, brand: "#07C160" },
  { label: "LINE", href: "https://line.me/R/ti/p/@gwprint", Icon: SiLine, brand: "#00C300" },
  { label: "Reddit", href: "https://reddit.com/r/gwprint", Icon: SiReddit, brand: "#FF4500" },
  { label: "Discord", href: "https://discord.gg/gwprint", Icon: SiDiscord, brand: "#5865F2" },
  { label: "LinkedIn", href: "https://linkedin.com/company/gwprint", Icon: LinkedInIcon, brand: "#0A66C2" },
  { label: "Email", href: "mailto:support@gwprint.com", Icon: Mail, brand: "var(--action-500)" },
];

export function FooterSocial() {
  return (
    // gap-2: eighteen small targets in a wrapping grid need at least 8px
    // between adjacent ones, or a mistap lands on the neighbouring network.
    <ul className="flex flex-wrap items-center gap-2">
      {SOCIAL_LINKS.map(({ label, href, Icon, brand }) => (
        <li key={label}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            style={{ "--brand": brand } as CSSProperties}
            className="flex size-9 -translate-y-0 items-center justify-center rounded-(--radius-pill) text-(--icon-muted) transition-all duration-200 hover:-translate-y-0.5 hover:bg-cream-200 hover:text-(--brand) hover:drop-shadow-[0_0_10px_var(--brand)] focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
          >
            <Icon className="size-4" />
          </a>
        </li>
      ))}
    </ul>
  );
}
