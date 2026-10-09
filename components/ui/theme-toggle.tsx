"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";
import { sounds } from "@/lib/sounds";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("vp-theme");
    const dark = stored === "dark";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("vp-theme", next ? "dark" : "light");
    } catch {
      /* private mode: dark mode just lasts this visit */
    }
    sounds.tick();
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
    >
      {isDark ? <SunIcon className="w-[18px] h-[18px]" /> : <MoonIcon className="w-[18px] h-[18px]" />}
    </button>
  );
}
