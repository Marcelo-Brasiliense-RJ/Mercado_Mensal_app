"use client";

import { SunIcon, MoonIcon } from "@/components/ui/icons";
import { useTheme } from "./useTheme";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className="grid h-10 w-10 place-items-center rounded-xl text-text-2 hover:bg-card-2"
    >
      {isDark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
    </button>
  );
}
