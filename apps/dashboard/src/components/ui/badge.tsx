import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-(length:--fs-meta) font-semibold tracking-(--ls-label) whitespace-nowrap transition-all focus-visible:shadow-(--shadow-focus) has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        // GWP badges are soft pills — a filled Action Blue chip competes with
        // the one primary button a region is allowed.
        default: "bg-navy-100 text-navy-700 [a]:hover:bg-navy-200",
        secondary: "bg-sky-100 text-navy-700 [a]:hover:bg-sky-200",
        destructive:
          "bg-(--status-critical-bg) text-(--status-critical-fg) [a]:hover:bg-(--status-critical-bg)",
        outline:
          "border-(--border-soft) text-navy-700 [a]:hover:bg-sky-50",
        ghost: "text-navy-600 hover:bg-sky-100",
        link: "text-(--text-link) underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
