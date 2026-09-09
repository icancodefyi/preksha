"use client";

/**
 * The only way to reach dark mode before this was a hidden "press d" hotkey
 * (see ThemeHotkey in theme-provider.tsx) -- a mode nobody can find isn't
 * really shippable. This puts a visible switch next to the language
 * selector on both pages.
 *
 * `resolvedTheme` (not `theme`) drives the icon: `theme` can be "system",
 * which tells you nothing about what's actually on screen right now.
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  variant = "light",
  className,
}: {
  /** "light" — for the translucent navbar pill. "chat" — for the plain chat header. */
  variant?: "light" | "chat";
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes only knows the real theme after mount (it reads localStorage
  // client-side, and does so during the client's first render pass -- not
  // after an effect -- so `resolvedTheme` can already differ from what the
  // server rendered before this component's own effects ever run). Gating
  // just the icon on `mounted` isn't enough: the FIRST render is what gets
  // diffed against the server output, so anything else that reads
  // `resolvedTheme` -- the title, the click handler's target theme -- has to
  // be gated the same way, or exactly one of them mismatches and React
  // discards the hydrated subtree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Deferred out of the synchronous effect body — calling setState
    // synchronously inside an effect can cascade renders before paint.
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={!mounted ? "Toggle theme" : isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center justify-center rounded-full transition-colors",
        variant === "light"
          ? "size-9 text-black/80 hover:bg-black/5"
          : "size-8 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
        className,
      )}
    >
      {!mounted ? (
        <span className="block size-4" />
      ) : isDark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}

export default ThemeToggle;
