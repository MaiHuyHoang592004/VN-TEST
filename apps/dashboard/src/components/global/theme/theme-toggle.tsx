/**
 * Theme toggle component with animation
 * Magic UI AnimatedThemeToggler in controlled mode, so next-themes stays
 * the single source of truth (persistence + no-flash on load).
 */

"use client";

import { useTheme } from "next-themes";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useIsHydrated } from "@/hooks/use-hydrated";

interface ThemeToggleProps {
  size?: "default" | "lg";
}

export function ThemeToggle({ size = "default" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  // Theme is unknown until hydration; render a placeholder to avoid a
  // mismatch on the sun/moon icon.
  const mounted = useIsHydrated();

  const sizeClasses =
    size === "lg"
      ? "h-11 w-11 [&>svg]:h-[1.5rem] [&>svg]:w-[1.5rem]"
      : "h-9 w-9 [&>svg]:h-[1.2rem] [&>svg]:w-[1.2rem]";

  if (!mounted) {
    return <div className={sizeClasses.split(" ").slice(0, 2).join(" ")} />;
  }

  return (
    <AnimatedThemeToggler
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      onThemeChange={setTheme}
      className={`hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${sizeClasses}`}
    />
  );
}
