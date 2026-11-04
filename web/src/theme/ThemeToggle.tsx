"use client";

import { SunIcon, MoonIcon } from "@/components/ui/icons";
import { useTheme } from "./useTheme";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className="ic-toque grid h-10 w-10 place-items-center rounded-xl text-text-2 hover:bg-card-2"
    >
      <span key={String(isDark)} className="ic-gira">
        {isDark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
      </span>
    </button>
  );
}
