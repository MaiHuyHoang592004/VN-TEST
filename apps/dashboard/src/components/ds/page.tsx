import { cn } from "@/lib/utils";

import { CraftCut } from "./craft-cut";
import { WoodRings } from "./brand/wood-rings";

/**
 * The page container every route shares — ported in spirit from the design
 * system's operational screens, and the reason this migration does not produce
 * "17 kinds of padding".
 *
 * A route's body is:
 *
 *   <Page>
 *     <PageHeader title={…} />
 *     <PageToolbar>…</PageToolbar>
 *     <DataTable … />
 *   </Page>
 *
 * The gutters (px-6 lg:px-20) and max width (max-w-7xl) are exactly what the
 * existing pages already use, so adopting Page changes no page's measurements —
 * it only stops the next page from choosing differently.
 */
export function Page({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      data-slot="page"
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 lg:px-20",
        className
      )}
    >
      {children}
    </main>
  );
}

const HERO_TONES = {
  // Saturated sky: the title is CREAM. Display ink follows the surface — a
  // navy headline here is the generic-SaaS look the DS rule exists to prevent.
  sky: {
    surface: "bg-(--surface-canvas)",
    title: "text-(--display-on-sky)",
    meta: "text-(--text-on-sky)",
    subtitle: "text-(--text-on-sky-secondary)",
    cutFrom: "var(--surface-canvas)",
  },
  // Pale sky and cream both carry a NAVY title.
  soft: {
    surface: "bg-(--surface-canvas-soft)",
    title: "text-(--display-on-pale-sky)",
    meta: "text-(--text-label)",
    subtitle: "text-(--text-muted)",
    cutFrom: "var(--surface-canvas-soft)",
  },
  cream: {
    surface: "bg-(--surface-content)",
    title: "text-(--display-on-cream)",
    meta: "text-(--text-label)",
    subtitle: "text-(--text-muted)",
    cutFrom: "var(--surface-content)",
  },
} as const;

/**
 * Title sizes are the DS's, verbatim from `_ds_bundle.js` → `function PageHero`:
 *
 *   titleSize = size === "sm" ? --fs-display-md
 *             : size === "lg" ? --fs-display-xl
 *             :                 --fs-display-lg
 *
 * The port had been one step down the ramp at every size (sm/md/lg), which made
 * every hero in the app quieter than the design: 24→32px at `sm`, 32→44px at
 * `md`. The DS ration on the display face (rule 4) assumes the title is the
 * largest thing on the screen; at 32px an `md` hero title was barely above a
 * section heading, so the sky field read as a coloured band rather than as the
 * page's brand moment. No hero in the app uses `lg`, so the 56px step only
 * exists for future module landing pages.
 *
 * RESPONSIVE.md steps hero type down at `sm` for MARKETING heroes (56–64 → 36).
 * The operational ceiling here is 44px, which holds at 375px, so there is no
 * breakpoint step — add one if a page ever adopts `size="lg"`.
 */
const HERO_SIZES = {
  // ONE STEP BELOW the DS ramp (which is md/lg/xl), and deliberately so. The
  // DS sizes assume a hero introducing a cream content section; here every
  // hero sits on the page's own sky and the pages carry their own display
  // figures. Bumping to the DS ramp put `size="md"` at --fs-display-lg, the
  // exact size of the wallet's balance figure — the screen's headline number
  // stopped outranking the page title. Raise per-call with `size` instead.
  sm: { pad: "px-6 pt-6 pb-8 lg:px-10", title: "text-(length:--fs-display-sm)" },
  md: { pad: "px-6 pt-8 pb-10 lg:px-10", title: "text-(length:--fs-display-md)" },
  lg: { pad: "px-6 pt-10 pb-14 lg:px-10", title: "text-(length:--fs-display-lg)" },
} as const;

/**
 * The operational page header.
 *
 * There is deliberately NO `action` prop. The DS: "The operational hero owns
 * NO CTA by design. Operational actions belong in TopNav.cta,
 * SearchShell.action or TabBar.right. A hero with a primary button in the
 * corner is the generic-SaaS page-header pattern, and this component
 * deliberately makes it unavailable." Put the action in <PageToolbar>.
 *
 * `tone="deep"` from the DS is deliberately NOT implemented: nothing in the
 * palette clears 4.5:1 on sky-600, and doing it correctly means auto-nesting
 * the eyebrow and subtitle onto light chips. Leaving it out beats shipping a
 * half-correct version of a rule about contrast.
 *
 * `children` is for secondary content INSIDE the hero — a status summary line,
 * a date range. Not actions.
 */
export function PageHeader({
  title,
  subtitle,
  meta,
  tone = "sky",
  rings = false,
  cut = true,
  cutTo = "var(--surface-shell)",
  size = "md",
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small uppercase eyebrow — module name or breadcrumb. */
  meta?: React.ReactNode;
  tone?: keyof typeof HERO_TONES;
  rings?: boolean;
  /** Render the Craft Cut into the surface below. */
  cut?: boolean;
  /**
   * What the Craft Cut sweeps INTO. Defaults to --surface-content (cream), as
   * the DS's PageHero does — the cut exists to cross the sky/cream boundary,
   * and this was hard-coded to --surface-shell (neutral-50), so every hero in
   * the app cut into grey and quietly defeated the rule the motif is for.
   * Pass --surface-shell explicitly on a page whose body really is the shell.
   */
  cutTo?: string;
  size?: keyof typeof HERO_SIZES;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = HERO_TONES[tone];
  const s = HERO_SIZES[size];

  return (
    <header
      data-slot="page-header"
      data-tone={tone}
      className={cn(
        "relative -mx-6 overflow-hidden rounded-(--radius-hero) lg:-mx-10",
        t.surface,
        className
      )}
    >
      {rings && <WoodRings className="absolute -top-8 -right-8" size={280} />}

      <div className={cn("relative", s.pad)}>
        {meta && (
          <p
            className={cn(
              "font-sans text-(length:--fs-micro) font-bold tracking-(--ls-caps) uppercase",
              t.meta
            )}
          >
            {meta}
          </p>
        )}
        <h1
          className={cn(
            "font-display leading-(--lh-display) font-(--fw-display) tracking-(--ls-display)",
            s.title,
            t.title
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className={cn("mt-2 max-w-2xl font-sans text-(length:--fs-body-lg)", t.subtitle)}>
            {subtitle}
          </p>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>

      {cut && <CraftCut from={t.cutFrom} to={cutTo} depth={56} sweep="right" />}
    </header>
  );
}

/**
 * The row of filters and actions under the header. This is where a page's
 * primary action lives — one Action Blue button, on the right.
 *
 * A page whose list already renders <DataTableToolbar> inside its DataTable
 * does NOT need this: that toolbar is the same surface and the same slot.
 * Use PageToolbar for pages with no table.
 */
export function PageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn(
        "flex flex-col gap-3 rounded-(--radius-card) bg-(--surface-shell) p-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A vertical group inside a page. Exists so sections never invent their own gap. */
export function PageSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-slot="page-section" className={cn("flex flex-col gap-4", className)}>
      {children}
    </section>
  );
}
