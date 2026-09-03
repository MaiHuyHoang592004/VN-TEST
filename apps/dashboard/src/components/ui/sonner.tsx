"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--surface-raised)",
          "--normal-text": "var(--text-body)",
          "--normal-border": "var(--border-hairline)",
          "--border-radius": "var(--radius-card)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-raised) shadow-(--shadow-md)",
          title: "font-sans text-(length:--fs-body-sm) text-(--text-body)",
          description: "font-sans text-(length:--fs-body-sm) text-(--text-muted)",
          success: "bg-(--status-success-bg) text-(--status-success-fg) border-(--status-success-bg)",
          error: "bg-(--status-critical-bg) text-(--status-critical-fg) border-(--status-critical-bg)",
          warning: "bg-(--status-attention-bg) text-(--status-attention-fg) border-(--status-attention-bg)",
          info: "bg-(--status-info-bg) text-(--status-info-fg) border-(--status-info-bg)",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
