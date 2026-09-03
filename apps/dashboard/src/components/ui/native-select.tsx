import * as React from "react"

import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-react"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

function NativeSelect({
  className,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="h-(--control-height) data-[size=sm]:h-(--control-height-sm) w-full min-w-0 appearance-none rounded-(--radius-control) border border-(--border-soft) bg-(--surface-inset) pl-3 pr-8 font-sans text-(length:--fs-body) text-(--text-body) transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-(--text-muted) hover:border-(--border-strong) focus-visible:border-(--border-focus) focus-visible:shadow-(--shadow-focus) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-(--status-critical-fg)"
        {...props}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none" aria-hidden="true" data-slot="native-select-icon" />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
