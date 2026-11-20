"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoIcon } from "@/components/ui/icons";
import { isQuickTodoKey, useQuickTodoKeys } from "../lib/quick-key";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** The inside: not in every page's code; loaded ahead, drawn at once (1.55.8: not next/dynamic, kept a placeholder up). */
let mod: typeof import("./quick-todo-panel") | null = null;
const loadPanel = () => import("./quick-todo-panel").then((m) => (mod = m));
const warm = (within: number) => void loadPanel().then((m) => m.warmBoard(within));
const USED = "vp:quick-todo-used";
const store = (set?: boolean) => {
  try {
    if (set) localStorage.setItem(USED, "1");
    return localStorage.getItem(USED) === "1";
  } catch {
    return false;
  }
};

function QuickTodoPanel({ onClose }: { onClose: () => void }) {
  const [m, setM] = useState(() => mod);
  useEffect(() => {
    if (!m) void loadPanel().then(setM);
  }, [m]);
  if (m) return <m.default onClose={onClose} />;
  return (
    <div className="p-4 space-y-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-11 rounded-xl" />
    </div>
  );
}

/**
 * To Do from anywhere (1.53.0): the top bar's button, or Alt+T. My Day, Important, Planned and Tasks: add, tick off,
 * star; a to-do opens in To Do.
 */
export function QuickTodo() {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const onTodo = pathname === "/todo" || pathname.startsWith("/todo/");
  const keys = useQuickTodoKeys();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // In a text box, ⌥T on a Mac types a letter (†): it stays a letter there.
      if (e.defaultPrevented || e.repeat || !isQuickTodoKey(e) || (typing(e.target) && e.key.toLowerCase() !== "t")) return;
      if (onTodo || document.querySelector('[role="dialog"][aria-modal="true"], [data-confirm]')) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTodo]);
  useEffect(() => setOpen(false), [pathname]);
  // Ahead: the page gone quiet (your To Do too if you use this), the button pointed at.
  useEffect(() => {
    const ahead = () => (store() ? warm(60_000) : void loadPanel());
    const idle = typeof requestIdleCallback === "function";
    const t = idle ? requestIdleCallback(ahead, { timeout: 5000 }) : window.setTimeout(ahead, 1500);
    return () => (idle ? cancelIdleCallback(t) : window.clearTimeout(t));
  }, []);
  useEffect(() => void (open && store(true)), [open]);
  const ahead = () => warm(15_000);
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={ahead}
        onFocus={ahead}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`To Do (${keys})`}
        title={`To Do (${keys})`}
        data-tour="quick-todo"
        className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${open ? "bg-surface-2 text-teal" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}
      >
        <TodoIcon className="w-[19px] h-[19px]" />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={400} align="right" role="dialog" label="To Do" maxHeight={620}>
        <QuickTodoPanel onClose={() => setOpen(false)} />
      </AnchoredMenu>
    </>
  );
}

