"use client";

import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { Moon, Sun } from "@/components/icons";

export function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");

    root.classList.add("theme-anim");
    root.classList.toggle("dark", next);
    root.style.colorScheme = next ? "dark" : "light";

    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* localStorage 不可用时忽略 */
    }

    setDark(next);
    window.setTimeout(() => root.classList.remove("theme-anim"), 420);
  }

  const isDark = mounted && dark;
  const label = isDark ? "切换到浅色模式" : "切换到深色模式";

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink",
        compact ? "h-9 w-9 justify-center" : "w-full px-3 py-2 text-sm",
        className
      )}
    >
      <span className="relative inline-flex h-4 w-4 items-center justify-center" suppressHydrationWarning>
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </span>
      {!compact ? <span suppressHydrationWarning>{isDark ? "浅色模式" : "深色模式"}</span> : null}
    </button>
  );
}
