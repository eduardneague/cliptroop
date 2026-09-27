"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
};

type ConfirmAPI = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmAPI | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback<ConfirmAPI>((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({ opts, resolve });
    });
  }, []);

  const confirmBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  function close(result: boolean) {
    state?.resolve(result);
    setState(null);
  }
  const closeRef = useRef(close);
  closeRef.current = close;

  // Esc cancels, Enter confirms (focus starts on the confirm button), and
  // focus goes back afterwards. Captured first so Esc doesn't also close
  // a popup underneath.
  useEffect(() => {
    if (!state) return;
    opener.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => confirmBtn.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      opener.current?.focus?.();
    };
  }, [state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-5"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-2xl bg-surface border border-line/10 p-6 shadow-xl animate-[modalin_.15s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="font-display text-lg font-semibold mb-1.5">
              {state.opts.title}
            </h2>
            {state.opts.description && (
              <p className="text-[13px] text-ink-soft leading-relaxed">
                {state.opts.description}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => close(false)}
                className="rounded-lg border border-line/15 px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                ref={confirmBtn}
                onClick={() => close(true)}
                className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 ${
                  state.opts.danger ? "bg-red" : "bg-amber"
                }`}
              >
                {state.opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmAPI {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
