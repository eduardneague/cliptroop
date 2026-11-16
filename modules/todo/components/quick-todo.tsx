"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoIcon } from "@/components/ui/icons";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** What's inside loads when it first opens (the frame stays as light as before, 1.32.2's budget). */
const QuickTodoPanel = dynamic(() => import("./quick-todo-panel"), {
  ssr: false,
  loading: () => (
    <div className="p-4 space-y-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-11 rounded-xl" />
    </div>
  ),
});

/**
 * To Do from anywhere (1.53.0, the owner: "a way to get to the to do faster"): the button in the top bar, or T on any
 * page. A small panel with My Day, Important, Planned and Tasks: add one, tick one off, star one; a to-do opens in To
 * Do. It reads your To Do when it opens (nothing on the page's own load).
 */
export function QuickTodo() {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const onTodo = pathname === "/todo" || pathname.startsWith("/todo/");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "t" || typing(e.target)) return;
      if (onTodo || document.querySelector('[role="dialog"][aria-modal="true"], [data-confirm]')) return;
      // A page that uses T itself (Thumbnail Studio's titles) says so by taking the key: then it's that page's.
      queueMicrotask(() => {
        if (!e.defaultPrevented) setOpen((o) => !o);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTodo]);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="To Do (T)"
        title="To Do (T)"
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

