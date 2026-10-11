"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { LockIcon } from "@/components/ui/icons";

export type DayShort = { id: string; number: number; title: string; locked: boolean; fixed: boolean };

/**
 * "Which shorts stay on this day?" Pick exactly `limit` of them. Posted
 * shorts are always kept. Keyboard: Tab/arrows through the choices,
 * Space to pick, Enter to confirm, Esc to cancel.
 */
export function KeepShortsDialog({
  dayLabel,
  limit,
  shorts,
  onConfirm,
  onCancel,
}: {
  dayLabel: string;
  limit: number;
  shorts: DayShort[];
  onConfirm: (keep: string[]) => void;
  onCancel: () => void;
}) {
  const locked = shorts.filter((s) => s.locked).map((s) => s.id);
  const [keep, setKeep] = useState<string[]>(() =>
    [...locked, ...shorts.filter((s) => !s.locked).map((s) => s.id)].slice(0, limit)
  );
  const boxRef = useRef<HTMLDivElement>(null);
  const single = limit === 1;
  const tooManyLocked = locked.length > limit;

  const cancel = useLatest(onCancel);
  useScrollLock();
  useEffect(() => {
    boxRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancel]);

  function toggle(id: string) {
    if (locked.includes(id)) return;
    if (single) return setKeep([id]);
    setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : k.length < limit ? [...k, id] : k));
  }

  const ready = !tooManyLocked && keep.length === Math.min(limit, shorts.length);
  const moving = shorts.length - keep.length;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/45 animate-[fadein_.12s_ease]" onClick={onCancel} aria-hidden />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keep-title"
        onKeyDown={(e) => {
          if (e.key === "Enter" && ready && !(e.target instanceof HTMLButtonElement)) {
            e.preventDefault();
            onConfirm(keep);
          }
        }}
        className="relative w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl border border-line/15 shadow-2xl p-5 animate-[modalin_.14s_ease]"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <h2 id="keep-title" className="text-[16px] font-semibold mb-1">
          {limit === 0 ? `Clear ${dayLabel}?` : `Which ${single ? "short stays" : `${limit} shorts stay`} on ${dayLabel}?`}
        </h2>
        <p className="text-[13px] text-ink-soft mb-4">
          {limit === 0
            ? "All shorts move to the next free days."
            : `The other ${moving === 1 ? "one moves" : `${moving} move`} to the next free day.`}
        </p>

        {limit > 0 && (
          <fieldset className="min-w-0 space-y-1.5 mb-5" aria-label="Shorts to keep">
            {shorts.map((s) => {
              const on = keep.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                    on ? "border-amber bg-amber/10" : "border-line/15 hover:border-line/30"
                  } ${s.locked ? "cursor-not-allowed" : ""}`}
                >
                  <input
                    type={single ? "radio" : "checkbox"}
                    name="keep"
                    checked={on}
                    disabled={s.locked}
                    onChange={() => toggle(s.id)}
                    className="w-4 h-4 accent-[rgb(var(--amber))]"
                  />
                  <span className="font-mono text-[12px] text-ink-soft tabular-nums flex-shrink-0">#{s.number}</span>
                  <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">{s.title}</span>
                  {s.locked ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-soft flex-shrink-0">
                      <LockIcon className="w-3 h-3" /> Posted
                    </span>
                  ) : s.fixed ? (
                    <span className="text-[11px] font-semibold text-ink-soft flex-shrink-0">Fixed</span>
                  ) : null}
                </label>
              );
            })}
          </fieldset>
        )}

        {tooManyLocked && (
          <p className="text-[12.5px] text-red mb-4">
            {locked.length} posted shorts are on this day and can&rsquo;t move. Pick at least {locked.length}.
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 h-11 sm:h-10 text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onConfirm(keep)}
            className="rounded-xl bg-amber text-white font-bold px-5 h-11 sm:h-10 text-[14px] disabled:opacity-45"
          >
            {limit === 0 ? "Clear the day" : single ? "Keep this one" : `Keep these ${limit}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
