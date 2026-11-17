import { useEffect, useState } from "react";

/** The quick To Do (1.53.3, was T): Alt+T, ⌥T on a Mac (Ctrl+T is the browser's). Not AltGr, which types ț. */
export const isQuickTodoKey = (e: KeyboardEvent) =>
  e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.getModifierState?.("AltGraph") && (e.code === "KeyT" || e.key.toLowerCase() === "t");

/** Alt+T, or ⌥T once the page knows it's a Mac. */
export function useQuickTodoKeys() {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return mac ? "⌥T" : "Alt+T";
}
