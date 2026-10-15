"use client";

import { useSyncExternalStore } from "react";

/**
 * The paper while the script loads: the same colour (light or dark paper)
 * and the same shape (one long page, or A4 pages) the person picked, so the
 * page doesn't change look when the text arrives.
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
  const pages = useSyncExternalStore(subscribe, () => ["pages", "spread", "grid"].includes(read("vp:script-view") ?? ""), () => false);
  return (
    <div
      data-paper={paper}
      className={`script-paper mx-auto w-full border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)] ${
        pages ? "max-w-[794px] rounded-md px-6 sm:px-[72px] py-10 sm:py-[72px] min-h-[70vh]" : "max-w-3xl rounded-2xl px-5 sm:px-14 py-8 sm:py-14"
      }`}
    >
      {children}
    </div>
  );
}
