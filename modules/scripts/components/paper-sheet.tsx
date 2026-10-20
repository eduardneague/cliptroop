"use client";

import { useSyncExternalStore } from "react";

/**
 * The paper while the script loads: the same colour (light or dark paper)
 * the person picked, so the page doesn't change look when the text arrives.
 */
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const subscribe = (f: () => void) => {
  window.addEventListener("storage", f);
  return () => window.removeEventListener("storage", f);
};

export function PaperSheet({ children }: { children: React.ReactNode }) {
  const paper = useSyncExternalStore(subscribe, () => (read("vp:script-paper") === "dark" ? "dark" : "light"), () => "light");
  return (
    <div data-paper={paper} className="script-paper mx-auto w-full max-w-3xl rounded-2xl px-5 sm:px-14 py-8 sm:py-14 border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)]">
      {children}
    </div>
  );
}
