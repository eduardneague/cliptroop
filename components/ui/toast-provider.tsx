"use client";

import { AlertIcon, CheckIcon, CloseIcon } from "./icons";
import { sounds, type SoundName } from "@/lib/sounds";
import { motionReduced } from "./count-up";
import { useSwipeAway } from "./use-swipe-away";
import { toastDuration } from "@/lib/notification-optimism";
import { belowWidth } from "@/lib/breakpoints";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

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
 *
 * 1.31.9: on a phone they sit in the middle at the top (on wider phones they
 * used to hug the left) and go with a swipe up as well as sideways; on a
 * computer a swipe down or sideways. The × is always there (it only showed
 * on hover), and they go sooner (lib/notification-optimism.ts →
 * toastDuration: 3.5 s, an error 5.5 s, one with Undo 6.5 s).
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
      arm(id, toastDuration({ kind, action: !!opts?.action, given: opts?.duration }));
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
        // Phones: top of the screen, in the middle, so a toast never covers a popup's buttons
        // (bottom sheets live at the bottom). Larger screens: bottom-right.
        className="fixed inset-x-0 px-3 sm:left-auto sm:right-5 sm:px-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:top-auto z-[200] flex flex-col items-stretch sm:items-end pointer-events-none"
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

const PHONE = belowWidth("sm");
/** On a phone (toasts at the top) or not (bottom-right). */
function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE).matches,
    () => false
  );
}

function ToastCard({ t, onDismiss }: { t: Toast; onDismiss: () => void }) {
  const phone = usePhone();
  const swipe = useSwipeAway({
    disabled: t.leaving,
    onSwipe: (dir, el) => {
      el.style.transform = `translateX(${dir * 115}%)`;
      el.style.opacity = "0";
      onDismiss();
    },
    // Away from the middle of the screen: up at the top of a phone, down at the bottom of a computer's.
    lift: phone ? "up" : "down",
    onLift: (dir, el) => {
      el.style.transform = `translateY(${dir === "up" ? -140 : 140}%)`;
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
            className={`toast-card glass-toast group pointer-events-auto flex items-center gap-2.5 rounded-xl pl-4 pr-1.5 py-2.5 shadow-lg text-[13px] font-medium w-full max-w-[420px] mx-auto sm:mx-0 sm:w-auto sm:max-w-md animate-[toastin_.2s_ease] ${
              t.kind === "error" ? "bg-red text-white" : "bg-ink text-paper"
            }`}
          >
            <span className="flex-shrink-0">
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
                className="ml-1 -my-0.5 flex-shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-bold bg-paper/15 hover:bg-paper/25 transition-colors"
              >
                {t.action.label}
              </button>
            )}
            {/* Always there (1.31.9; it used to wait for the pointer). */}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              title="Dismiss"
              className="-my-1 w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-paper/15 focus-visible:opacity-100 transition-opacity"
            >
              <CloseIcon className="w-3.5 h-3.5" />
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
