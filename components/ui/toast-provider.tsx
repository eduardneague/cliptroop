"use client";

import { AlertIcon, CheckIcon } from "./icons";
import { sounds, type SoundName } from "@/lib/sounds";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastAction = { label: string; onClick: () => void };
/** sound: a different sound than the default (success/error), or false for none. */
type ToastOptions = { action?: ToastAction; duration?: number; sound?: SoundName | false };
type Toast = { id: number; kind: "success" | "error"; message: string; action?: ToastAction };
type ToastAPI = {
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastAPI | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: Toast["kind"], message: string, opts?: ToastOptions) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, kind, message, action: opts?.action }]);
      const sound = opts?.sound ?? (kind === "error" ? "error" : "success");
      if (sound) sounds[sound]();
      // Toasts with an action stay long enough to actually use it.
      setTimeout(() => dismiss(id), opts?.duration ?? (opts?.action ? 9000 : 4200));
    },
    [dismiss]
  );

  const api: ToastAPI = {
    success: (message, opts) => push("success", message, opts),
    error: (message, opts) => push("error", message, opts),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // Phones: top of the screen, so a toast never covers a popup's buttons
        // (bottom sheets live at the bottom). Larger screens: bottom-right.
        className="fixed left-3 right-3 sm:left-auto sm:right-5 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:top-auto sm:bottom-5 z-[200] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none"
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-lg text-[13px] font-medium max-w-sm animate-[toastin_.2s_ease] ${
              t.kind === "error" ? "bg-red text-white" : "bg-ink text-paper"
            }`}
          >
            <span className="mt-[1px] flex-shrink-0">
              {t.kind === "error" ? <AlertIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
            </span>
            <span className="leading-snug">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="ml-1 -my-0.5 flex-shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-bold bg-paper/15 hover:bg-paper/25 transition-colors"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
