"use client";

import { AlertIcon, CheckIcon, CloseIcon } from "./icons";
import { sounds, type SoundName } from "@/lib/sounds";
import { motionReduced } from "./count-up";
import { useSwipeAway } from "./use-swipe-away";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ToastAction = { label: string; onClick: () => void };
/** sound: a different sound than the default (success/error), or false for none. */
type ToastOptions = { action?: ToastAction; duration?: number; sound?: SoundName | false };
type Toast = { id: number; kind: "success" | "error"; message: string; action?: ToastAction; leaving?: boolean };
type ToastAPI = {
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastAPI | null>(null);

/** How long one takes to slide out and close its gap (styles: .toast-item in globals.css). */
const LEAVE_MS = 400;

/*
 * Toasts (1.31.4): a toast that goes slides out and the others glide into
 * its place; glass with the glass look; swipe one away (or its ×); they
 * wait while the pointer is on them.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  // When each one goes by itself, and its timer (paused while pointed at).
  const due = useRef(new Map<number, { at: number; left: number; timer: number | null }>());
  const paused = useRef(false);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const dismiss = useCallback(
    (id: number) => {
      const d = due.current.get(id);
      if (d?.timer) window.clearTimeout(d.timer);
      due.current.delete(id);
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      window.setTimeout(() => remove(id), motionReduced() ? 0 : LEAVE_MS);
    },
    [remove]
  );
  const arm = useCallback(
    (id: number, ms: number) => {
      const d = { at: Date.now() + ms, left: ms, timer: null as number | null };
      if (!paused.current) d.timer = window.setTimeout(() => dismiss(id), ms);
      due.current.set(id, d);
    },
    [dismiss]
  );

  const push = useCallback(
    (kind: Toast["kind"], message: string, opts?: ToastOptions) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, kind, message, action: opts?.action }]);
      const sound = opts?.sound ?? (kind === "error" ? "error" : "success");
      if (sound) sounds[sound]();
      // Toasts with an action stay long enough to actually use it.
      arm(id, opts?.duration ?? (opts?.action ? 9000 : 4200));
    },
    [arm]
  );

  // Pointed at: they all wait. Let go: the time they had left (a moment at least).
  const pause = () => {
    paused.current = true;
    for (const d of due.current.values()) {
      if (d.timer) window.clearTimeout(d.timer);
      d.timer = null;
      d.left = Math.max(0, d.at - Date.now());
    }
  };
  const resume = () => {
    paused.current = false;
    for (const [id, d] of due.current) {
      const ms = Math.max(1200, d.left);
      d.at = Date.now() + ms;
      d.timer = window.setTimeout(() => dismiss(id), ms);
    }
  };
  useEffect(() => {
    const all = due.current;
    return () => all.forEach((d) => d.timer && window.clearTimeout(d.timer));
  }, []);

  // The same object every time (1.31.4): pages that use toasts don't redo their work when one comes or goes.
  const api = useMemo<ToastAPI>(
    () => ({
      success: (message, opts) => push("success", message, opts),
      error: (message, opts) => push("error", message, opts),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // Phones: top of the screen, so a toast never covers a popup's buttons
        // (bottom sheets live at the bottom). Larger screens: bottom-right.
        className="fixed left-3 right-3 sm:left-auto sm:right-5 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:top-auto z-[200] flex flex-col items-stretch sm:items-end pointer-events-none"
        // Each toast keeps 12 px under it (its shadow): the stack sits that much lower.
        style={{ bottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
        aria-live="polite"
        onPointerEnter={(e) => e.pointerType === "mouse" && pause()}
        onPointerLeave={(e) => e.pointerType === "mouse" && resume()}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ t, onDismiss }: { t: Toast; onDismiss: () => void }) {
  const swipe = useSwipeAway({
    disabled: t.leaving,
    onSwipe: (dir, el) => {
      el.style.transform = `translateX(${dir * 115}%)`;
      el.style.opacity = "0";
      onDismiss();
    },
  });
  return (
    <div className="toast-item" data-leaving={t.leaving ? "" : undefined}>
      <div className="toast-clip">
        <div className="toast-gap">
          <div
            {...swipe}
            role={t.kind === "error" ? "alert" : "status"}
            className={`toast-card glass-toast group pointer-events-auto flex items-start gap-2.5 rounded-xl pl-4 pr-2 py-3 shadow-lg text-[13px] font-medium max-w-sm animate-[toastin_.2s_ease] ${
              t.kind === "error" ? "bg-red text-white" : "bg-ink text-paper"
            }`}
          >
            <span className="mt-[1px] flex-shrink-0">
              {t.kind === "error" ? <AlertIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
            </span>
            <span className="leading-snug flex-1 min-w-0">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  onDismiss();
                }}
                className="ml-1 -my-0.5 flex-shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-bold bg-paper/15 hover:bg-paper/25 transition-colors"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="-my-0.5 w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-paper/15 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-70 focus-visible:opacity-100"
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
