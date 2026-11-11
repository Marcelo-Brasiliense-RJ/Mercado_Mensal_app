"use client";

import { useEffect, useState } from "react";

// Fonte da verdade do tema: atributo data-theme no <html> (setado cedo pelo
// script em layout.tsx) + localStorage. Compartilhado por ThemeToggle (mobile)
// e pela sidebar (desktop).
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") setTheme(t);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("dispensa-theme", next);
    } catch {}
  }

  return { theme, toggle, isDark: theme === "dark" };
}
