"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./icons";
import { sounds } from "@/lib/sounds";
import { onThemeChange, setDark, storedDark } from "@/lib/theme";
import { changeLook } from "@/lib/look-screen";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const dark = storedDark();
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    // The other switches (header, Settings, the search bar) and other tabs.
    return onThemeChange(setIsDark);
  }, []);

  function toggle() {
    const next = !isDark;
    // Clip covers the switch while every pane restyles (1.29.8).
    changeLook(next ? "dark" : "light", () => setDark(next));
    sounds.tick();
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Turn off dark mode" : "Turn on dark mode"}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
    >
      {isDark ? <SunIcon className="w-[18px] h-[18px]" /> : <MoonIcon className="w-[18px] h-[18px]" />}
    </button>
  );
}
