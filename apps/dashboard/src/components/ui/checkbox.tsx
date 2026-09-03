"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // --radius-xs (8px) is the smallest radius in the system; the old
        // rounded-[4px] was a Geist value. size-4 and the ±3px hit-area
        // expander stay: they are the a11y target, not styling.
        "peer relative flex size-4 shrink-0 items-center justify-center",
        "rounded-(--radius-xs) border border-(--border-soft) bg-(--surface-data)",
        "transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "hover:border-(--border-strong)",
        "focus-visible:border-(--border-focus) focus-visible:shadow-(--shadow-focus)",
        "disabled:cursor-not-allowed disabled:opacity-45 group-has-disabled/field:opacity-45",
        "aria-invalid:border-(--status-critical-fg)",
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
