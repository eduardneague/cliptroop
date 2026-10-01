"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon, ArrowLeftIcon } from "./icons";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parse(s: string) {
  return new Date(s + "T00:00:00");
}
function addDays(s: string, n: number) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
function addMonths(s: string, n: number) {
  const d = parse(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return iso(d);
}

export type DayInfo = { count: number; limit: number } | null;

/**
 * Calendar popover (weeks start Monday). Keyboard:
 *   ←/→ day · ↑/↓ week · PageUp/PageDown month · Home/End week start/end
 *   Enter/Space pick · Esc close
 * Optional `dayInfo` draws load dots under each day (e.g. shorts planned
 * vs the per-day limit), in the team's shorts colour: hollow = planned, solid = full.
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
  /** Shows a "Clear" action in the footer when provided. */
  onClear?: () => void;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<string>("");
  const [cursor, setCursor] = useState<string>("");
  // The month on screen. Only the arrows or the keyboard change it —
  // never the mouse (hovering a greyed edge day used to flip months).
  const [viewMonth, setViewMonth] = useState<string>("");
  const [pos, setPos] = useState({ left: 0, top: 0, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = 304;
    const up = window.innerHeight - r.bottom < 380 && r.top > window.innerHeight - r.bottom;
    setPos({
      left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8),
      top: up ? r.top - 6 : r.bottom + 6,
      up,
    });
  }, []);

  function openPicker() {
    if (disabled) return;
    const t = iso(new Date());
    setToday(t);
    setCursor(value ?? t);
    setViewMonth((value ?? t).slice(0, 7));
    place();
    setOpen(true);
  }

  function close(focusBtn = true) {
    setOpen(false);
    if (focusBtn) btn.current?.focus();
  }

  function pick(d: string) {
    onChange(d);
    close();
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

  // Keep DOM focus on the cursor day.
  useEffect(() => {
    if (!open || !cursor) return;
    grid.current?.querySelector<HTMLElement>(`[data-date="${cursor}"]`)?.focus({ preventScroll: true });
  }, [open, cursor]);

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(cursor, e.shiftKey ? 12 : 1),
      Home: () => addDays(cursor, -((parse(cursor).getDay() + 6) % 7)),
      End: () => addDays(cursor, 6 - ((parse(cursor).getDay() + 6) % 7)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      const next = moves[e.key]();
      setCursor(next);
      setViewMonth(next.slice(0, 7));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  // Month grid around the cursor: 6 rows × 7, Monday first.
  const monthStart = viewMonth ? parse(viewMonth + "-01") : new Date();
  const offset = (monthStart.getDay() + 6) % 7;
  const first = iso(new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - offset));
  const days = viewMonth ? Array.from({ length: 42 }, (_, i) => addDays(first, i)) : [];
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const inMonth = (d: string) => d.slice(0, 7) === viewMonth;

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
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => {
                  const next = addMonths(cursor, -1);
                  setCursor(next);
                  setViewMonth(next.slice(0, 7));
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
                aria-label="Previous month"
              >
                <ArrowLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-[14px] font-semibold" aria-live="polite">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = addMonths(cursor, 1);
                  setCursor(next);
                  setViewMonth(next.slice(0, 7));
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
                aria-label="Next month"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((w, i) => (
                <span key={w} className={`text-center text-[10.5px] font-bold uppercase ${i >= 5 ? "text-ink-faint" : "text-ink-soft"}`}>
                  {w}
                </span>
              ))}
            </div>

            <div ref={grid} role="grid" onKeyDown={onGridKey} className="grid grid-cols-7 gap-0.5">
              {days.map((d) => {
                const info = dayInfo?.(d) ?? null;
                const selected = d === value;
                const isToday = d === today;
                const isCursor = d === cursor;
                const full = !!info && info.count >= info.limit;
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    data-date={d}
                    tabIndex={isCursor || (!days.includes(cursor) && d === viewMonth + "-01") ? 0 : -1}
                    aria-selected={selected}
                    aria-label={`${parse(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${
                      info && info.count ? `, ${info.count} of ${info.limit} planned` : ""
                    }`}
                    onClick={() => pick(d)}
                    className={`relative h-10 rounded-lg flex flex-col items-center justify-center text-[13px] tabular-nums transition-colors focus:outline-none ${
                      selected
                        ? "bg-amber text-white font-bold"
                        : `${isCursor ? "bg-surface-2 ring-1 ring-line/25" : "hover:bg-surface-2"} ${
                            isToday ? "text-amber font-bold" : inMonth(d) ? "text-ink" : "text-ink-faint"
                          }`
                    } ${d < today && !selected ? "opacity-55" : ""}`}
                  >
                    {Number(d.slice(8))}
                    {info && info.count > 0 && (
                      <span className="absolute bottom-1 flex gap-[2px]" aria-hidden>
                        {Array.from({ length: Math.min(info.count, 4) }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-[5px] h-[5px] rounded-full ${
                              // Shape, not shade: hollow = planned, solid = full (team shorts colour).
                              selected ? (full ? "bg-white" : "border border-white") : full ? "bg-short" : "border-[1.5px] border-short"
                            }`}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-line/10">
              <button
                type="button"
                onClick={() => pick(today)}
                className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-amber hover:bg-amber/10"
              >
                Today
              </button>
              {onClear && value && (
                <button
                  type="button"
                  onClick={() => {
                    onClear();
                    close();
                  }}
                  className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-red hover:bg-red/10"
                >
                  {clearLabel}
                </button>
              )}
              {dayInfo && !onClear && (
                <span className="flex items-center gap-2 text-[11px] text-ink-soft">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-[7px] h-[7px] rounded-full border-[1.5px] border-short" /> planned
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-[7px] h-[7px] rounded-full bg-short" /> full
                  </span>
                </span>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
