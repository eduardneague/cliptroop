"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonthCalendar, type DayInfo } from "./month-calendar";
import { CalendarIcon, CloseIcon } from "./icons";
import { CLEAR_DATE_CONFIRM, useConfirmSafe } from "./confirm-provider";

export type { DayInfo };

/**
 * A button that opens THE calendar (components/ui/month-calendar.tsx) in a
 * popover. Every date in the app is picked with this, so they all look and
 * work the same. `dayInfo` optionally overrides the shorts count/limit per
 * day (e.g. to leave out the short you're moving).
 */
export function DatePicker({
  value,
  onChange,
  dayInfo,
  triggerClassName,
  children,
  ariaLabel = "Pick a date",
  disabled,
  onClear,
  clearLabel = "Clear date",
}: {
  value: string | null;
  onChange: (date: string) => void;
  dayInfo?: (date: string) => DayInfo;
  triggerClassName?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  /** Shows a "Clear date" action in the footer when provided. */
  onClear?: () => void;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = 304;
    const up = window.innerHeight - r.bottom < 390 && r.top > window.innerHeight - r.bottom;
    setPos({ left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8), top: up ? r.top - 6 : r.bottom + 6, up });
  }, []);

  function openPicker() {
    if (disabled) return;
    place();
    setOpen(true);
  }
  function close(focusBtn = true) {
    setOpen(false);
    if (focusBtn) btn.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || pop.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openPicker())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            openPicker();
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={triggerClassName}
      >
        {children}
      </button>

      {open &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={ariaLabel}
            style={{ left: pos.left, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
            className="fixed z-[130] w-[304px] rounded-2xl border border-line/15 bg-surface shadow-2xl p-3 animate-[modalin_.12s_ease]"
          >
            <MonthCalendar
              value={value}
              autoFocus
              dayInfo={dayInfo}
              onPick={(d) => {
                onChange(d);
                close();
              }}
              onEscape={() => close()}
              onClear={
                onClear
                  ? () => {
                      onClear();
                      close();
                    }
                  : undefined
              }
              clearLabel={clearLabel}
            />
          </div>,
          document.body
        )}
    </>
  );
}

const niceDate = (d: string) => {
  const date = new Date(`${d}T00:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
};

/**
 * The standard date field: a compact chip with the calendar icon
 * ("Pick a date" / "Fri, Oct 9"), opening THE calendar. With `onClear`, a
 * small × clears it.
 */
export function DateChip({
  value,
  onChange,
  onClear,
  placeholder = "Pick a date",
  ariaLabel = "Pick a date",
  dayInfo,
  disabled,
  className = "",
}: {
  value: string | null;
  onChange: (date: string) => void;
  onClear?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  dayInfo?: (date: string) => DayInfo;
  disabled?: boolean;
  className?: string;
}) {
  const set = !!value;
  const confirmClear = useConfirmSafe();
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <DatePicker
        value={value}
        onChange={onChange}
        onClear={onClear}
        dayInfo={dayInfo}
        ariaLabel={ariaLabel}
        disabled={disabled}
        triggerClassName={`inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-[12.5px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
          set ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
        }`}
      >
        <CalendarIcon className={`w-3.5 h-3.5 ${set ? "text-amber" : ""}`} />
        {value ? niceDate(value) : placeholder}
      </DatePicker>
      {set && onClear && !disabled && (
        <button
          type="button"
          onClick={async () => {
            if (await confirmClear(CLEAR_DATE_CONFIRM)) onClear();
          }}
          aria-label="Clear date"
          className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}
