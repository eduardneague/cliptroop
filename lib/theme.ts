/**
 * Light or dark, in one place (1.26.0): the header's switch, the one in
 * Settings → Preferences and the search bar's "Turn on dark mode" all go
 * through here, so they always agree. Remembered on this device
 * ("vp-theme"; app/layout.tsx applies it before the page draws).
 */

export const THEME_KEY = "vp-theme";
const EVENT = "vp-theme-change";

export function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** The saved choice (falls back to what the page shows). */
export function storedDark(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return isDark();
  }
}

export function setDark(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    /* private mode: it just lasts this visit */
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: dark }));
}

/** Told whenever it changes: here, or in another tab of the app. */
export function onThemeChange(fn: (dark: boolean) => void): () => void {
  const here = (e: Event) => fn(!!(e as CustomEvent<boolean>).detail);
  const elsewhere = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    const dark = e.newValue === "dark";
    document.documentElement.classList.toggle("dark", dark);
    fn(dark);
  };
  window.addEventListener(EVENT, here);
  window.addEventListener("storage", elsewhere);
  return () => {
    window.removeEventListener(EVENT, here);
    window.removeEventListener("storage", elsewhere);
  };
}
