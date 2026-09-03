import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Same inset well as Input, but card radius: a multi-line field is a
        // small surface, not a control.
        "flex field-sizing-content min-h-16 w-full rounded-(--radius-card)",
        "border border-(--border-soft) bg-(--surface-inset) px-3 py-2",
        "font-sans text-(length:--fs-body) leading-(--lh-body) text-(--text-body)",
        "transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) outline-none",
        "placeholder:text-(--text-muted)",
        "hover:border-(--border-strong)",
        "focus-visible:border-(--border-focus) focus-visible:shadow-(--shadow-focus)",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-(--status-critical-fg)",
        "max-md:text-base",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
