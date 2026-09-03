import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The GWP button — a soft PILL by default, borderless, carried by its fill and
 * one quiet shadow. Ported from the design system's `components/core/Button`.
 *
 * Action Blue (`variant="default"`) is reserved for the single most important
 * action in a region: one per toolbar, one per dialog footer. Everything else
 * is `outline` (white pill, blue ink — the DS's `secondary`), `secondary`
 * (pale sky fill, navy ink — the DS's `soft`) or `ghost`.
 *
 * The prop is `variant` — shadcn's real name, restored in Task 0b after the
 * upstream mangle had renamed it to `product`.
 *
 * `variant="inverse"` is for NAVY-class grounds only — cream ink on navy-700
 * clears 4.5:1. It is NOT valid on `--surface-hero-deep` (sky-600), where cream
 * is 3.65:1 and therefore large-text only; use `cream` or `outline` there.
 * `ghost` is LIGHT GROUNDS ONLY: its hover swaps in a pale sky fill, so a
 * light-labelled ghost on a dark ground goes invisible.
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center",
    "border border-transparent bg-clip-padding whitespace-nowrap select-none",
    "font-sans font-bold tracking-(--ls-label) leading-none",
    // GWP motion: 140ms ease-out on colour/shadow, and a press scale instead
    // of the Geist 1px nudge.
    "transition-[background-color,color,border-color,box-shadow,transform] duration-(--dur-fast) ease-(--ease-out)",
    "active:not-aria-[haspopup]:scale-(--press-scale)",
    "motion-reduce:transition-none motion-reduce:active:scale-100",
    // Focus is the DS's blue glow, not a ring-offset halo.
    "outline-none focus-visible:shadow-(--shadow-focus)",
    // Disabled keeps the variant's own colours and drops to 45% — the DS does
    // not repaint a disabled control grey.
    "disabled:pointer-events-none disabled:opacity-45",
    "aria-invalid:border-(--status-critical-fg) aria-invalid:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        // Action Blue fill, white label — one per region.
        default:
          "bg-primary text-primary-foreground shadow-(--shadow-sm) hover:bg-action-600",
        // The DS's `secondary`: white pill, Action Blue label. This is the
        // app's workhorse second action, so it takes the DS's second variant.
        outline:
          "bg-(--surface-data) text-action-600 shadow-(--shadow-sm) hover:bg-sky-50 aria-expanded:bg-sky-50",
        // The DS's `soft`: pale sky fill, navy label — quiet brand action.
        secondary:
          "bg-sky-200 text-navy-700 shadow-(--shadow-xs) hover:bg-sky-300 aria-expanded:bg-sky-300",
        // LIGHT GROUNDS ONLY (see the file comment).
        ghost:
          "bg-transparent text-navy-600 hover:bg-sky-100 aria-expanded:bg-sky-100",
        // The DS's `danger`. Deliberately NOT a filled red button: the system
        // has none, and one would be a new colour.
        destructive:
          "bg-(--surface-data) text-(--status-critical-fg) border-(--status-critical-bg) shadow-(--shadow-xs) hover:bg-(--status-critical-bg)",
        link: "text-(--text-link) underline-offset-4 hover:text-(--text-link-hover) hover:underline",
        // Marketing / brand surfaces.
        cream:
          "bg-cream-100 text-navy-700 shadow-(--shadow-sm) hover:bg-cream-200",
        // NAVY-class grounds only.
        inverse:
          "bg-transparent text-cream-100 border-cream-100/34 hover:bg-cream-100/18 hover:border-cream-100/50",
        // Yellow. Marketing only, very rare.
        accent:
          "bg-yellow-500 text-navy-900 shadow-(--shadow-xs) hover:bg-yellow-500/85",
      },
      /**
       * `pill` is the default everywhere. `rounded` (10px, --radius-control)
       * is for dense operational toolbars only — a row of pills in a filter
       * bar reads as scattered lozenges.
       */
      shape: {
        pill: "rounded-(--radius-pill)",
        rounded: "rounded-(--radius-control)",
      },
      size: {
        // GWP control ladder: 32 / 40 / 48px — the same heights as before.
        // Padding widens because a pill needs more horizontal room than a
        // rectangle to read as one shape (DS Button PAD: 16 / 22 / 28px).
        default:
          "h-10 gap-2 px-[22px] text-(length:--fs-body) has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-6 gap-1 px-3 text-(length:--fs-micro) [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-4 text-(length:--fs-body-sm) [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-7 text-(length:--fs-body-lg) has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        // IconButton — square, and the DS keeps icon buttons circular.
        icon: "size-10 p-0",
        "icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 p-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "pill",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  shape = "pill",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, shape, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
