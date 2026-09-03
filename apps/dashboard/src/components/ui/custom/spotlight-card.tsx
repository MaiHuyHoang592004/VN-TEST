"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Vercel-style card: a blue spotlight on the border follows the mouse.
 * Styling lives in globals.css (.spotlight-card); this only feeds it
 * the cursor position via the --mx/--my CSS variables.
 */
export function SpotlightCard({
  className,
  onMouseMove,
  ...props
}: React.ComponentProps<"div">) {
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`)
    e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`)
    onMouseMove?.(e)
  }

  return (
    <div
      className={cn("spotlight-card", className)}
      onMouseMove={handleMouseMove}
      {...props}
    />
  )
}
