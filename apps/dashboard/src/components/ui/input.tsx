import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // GWP fields are INSET wells: the faintest sky fill with a hairline,
        // not a transparent box. 40px = --control-height; 10px =
        // --radius-control. Placeholder ink sits on the navy-500 contrast
        // floor and is never dimmed with opacity.
        "h-(--control-height) w-full min-w-0 rounded-(--radius-control)",
        "border border-(--border-soft) bg-(--surface-inset) px-3 py-1",
        "font-sans text-(length:--fs-body) text-(--text-body)",
        "transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) outline-none",
        "placeholder:text-(--text-muted)",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-(length:--fs-body-sm) file:font-semibold file:text-(--text-body)",
        "hover:border-(--border-strong)",
        "focus-visible:border-(--border-focus) focus-visible:shadow-(--shadow-focus)",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-(--status-critical-fg)",
        className
      )}
      {...props}
    />
  )
}

export { Input }
