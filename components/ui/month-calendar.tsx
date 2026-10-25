"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlannedRange } from "@/app/(dashboard)/calendar/planned-days";
import { ArrowLeftIcon, ChevronRightIcon } from "./icons";
import { PostedTick } from "./posted-tick";
import { CLEAR_DATE_CONFIRM, useConfirmSafe } from "./confirm-provider";
import { Leaves } from "./leaves";

/*
 * THE calendar. Every month calendar in the app is this component (date
 * pickers, the dashboard Calendar widget, …), so it looks and behaves the
 * same everywhere. Change it here and it changes everywhere.
 *
 *  - Weeks start Monday, 6 rows, today in amber, past days dimmed.
 *  - Under each day: shorts as small squares (hollow = planned, solid = the
 *    day is full for the team's shorts-per-day rule), long videos in the
 *    long colour and meetings as a violet dot. Hover (or press and hold on phones) a day to see what's on it.
 *  - Footer: Today (+ Clear when clearing is allowed) and the legend.
 *  - Keyboard: ←/→ day · ↑/↓ week · PageUp/PageDown month (Shift = year) ·
 *    Home/End week start/end · Enter/Space pick · Esc (onEscape).
 */

export type DayInfo = { count: number; limit: number } | null;

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
// What's planned per visible 6 weeks, remembered while the page is open,
// and the asks on their way (two calendars asking for the same weeks share one).
const CACHE = new Map<string, PlannedRange>();
const ASKING = new Map<string, Promise<PlannedRange | null>>();

/** The 42 days (6 weeks from Monday) a month shows. */
function gridOf(month: string): string[] {
  const start = parse(`${month}-01`);
  const first = isoDay(new Date(start.getFullYear(), start.getMonth(), 1 - ((start.getDay() + 6) % 7)));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/**
 * What's planned on a month's days (1.22.0: a GET route, not a server
 * action, so the dots never wait behind the page's other calls; the same
 * weeks are asked once at a time and remembered).
 */
function plannedFor(month: string, fresh = false): Promise<PlannedRange | null> {
  const days = gridOf(month);
  const key = `${days[0]}:${days[41]}`;
  const busy = ASKING.get(key);
  if (busy) return busy;
  if (!fresh && CACHE.has(key)) return Promise.resolve(CACHE.get(key)!);
  const p = fetch(`/api/calendar/planned?from=${days[0]}&to=${days[41]}`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<PlannedRange>) : null))
    .then((r) => {
      if (r) CACHE.set(key, r);
      return r;
    })
    .catch(() => null)
    .finally(() => ASKING.delete(key));
  ASKING.set(key, p);
  return p;
}

/**
 * Get a calendar's dots ready before it opens (a date button pointed at or
 * focused): the month of `day` (default: this month).
 */
export function warmPlannedDays(day?: string | null) {
  const d = day && DAY_RX.test(day) ? day : isoDay(new Date());
  if (!CACHE.has(`${gridOf(d.slice(0, 7))[0]}:${gridOf(d.slice(0, 7))[41]}`)) void plannedFor(d.slice(0, 7));
}

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(s + "T00:00:00");
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
const addMonths = (s: string, n: number) => {
  const d = parse(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return isoDay(d);
};

export function MonthCalendar({
  value = null,
  onPick,
  hrefFor,
  dayInfo,
  onClear,
  clearLabel = "Clear date",
  onEscape,
  autoFocus = false,
  fit = false,
  className = "",
}: {
  /** The picked day (highlighted). */
  value?: string | null;
  /** Clicking a day picks it… */
  onPick?: (date: string) => void;
  /** …or opens a page for it (e.g. the big calendar). */
  hrefFor?: (date: string) => string;
  /** Overrides the shorts count/limit for a day (e.g. leave out the short being moved). */
  dayInfo?: (date: string) => DayInfo;
  /** Shows "Clear date" in the footer (when a date is set). */
  onClear?: () => void;
  clearLabel?: string;
  onEscape?: () => void;
  /** Focus the cursor day when it opens (pickers). */
  autoFocus?: boolean;
  /** Fill the box it's in (widgets) instead of the fixed picker size. */
  fit?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const confirmClear = useConfirmSafe();
  const [today, setToday] = useState("");
  const [cursor, setCursor] = useState("");
  // The month on screen. Only the arrows or the keyboard change it, never
  // the mouse (hovering a greyed edge day used to flip months).
  const [viewMonth, setViewMonth] = useState("");
  // What's planned, for which 6 weeks: from the cache straight away when it's there (a warmed calendar opens with its dots).
  const [got, setGot] = useState<{ key: string; r: PlannedRange } | null>(() => {
    const v = value && DAY_RX.test(value) ? value : null;
    if (!v) return null;
    const g = gridOf(v.slice(0, 7));
    const key = `${g[0]}:${g[41]}`;
    const r = CACHE.get(key);
    return r ? { key, r } : null;
  });
  // The weeks we stopped waiting for (it failed, or took too long): the days show without their dots.
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  // Phones (press and hold): where the held day is, so the card opens above
  // its row (or below it, for the top rows) instead of over the days around it.
  const [peekAt, setPeekAt] = useState<{ top: number; bottom: number; height: number; below: boolean } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusDays = useRef(autoFocus);
  // Narrow boxes (a small widget): the legend shows just its squares.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!fit || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 270));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, viewMonth]);

  // The viewer's own "today" (the server's clock is UTC): set in the browser.
  useEffect(() => {
    const t = isoDay(new Date());
    const v = value && DAY_RX.test(value) ? value : t;
    setToday(t);
    setCursor(v);
    setViewMonth(v.slice(0, 7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthStart = viewMonth ? parse(viewMonth + "-01") : null;
  const first = monthStart ? isoDay(new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - ((monthStart.getDay() + 6) % 7))) : "";
  const days = first ? Array.from({ length: 42 }, (_, i) => addDays(first, i)) : [];

  useEffect(() => {
    if (!viewMonth) return;
    const key = `${days[0]}:${days[41]}`;
    // Show what we have instantly, then refresh (plans change), then get the
    // months either side ready so the arrows are instant too.
    const hit = CACHE.get(key);
    if (hit) setGot({ key, r: hit });
    let alive = true;
    // 1.27.5: the days wait for their dots (a moment), so they arrive together; not forever.
    const slow = hit ? 0 : window.setTimeout(() => alive && setGaveUp(key), 1500);
    void plannedFor(viewMonth, !!hit).then((r) => {
      if (!alive) return;
      if (r) setGot({ key, r });
      else setGaveUp(key);
      for (const m of [addMonths(`${viewMonth}-01`, -1), addMonths(`${viewMonth}-01`, 1)]) warmPlannedDays(m);
    });
    return () => {
      alive = false;
      window.clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth]);
  const weeksKey = days.length ? `${days[0]}:${days[41]}` : "";
  const range = got?.key === weeksKey ? got.r : null;
  // Waiting for this month's dots: the grid shimmers instead of showing days that are about to change.
  const waiting = !!weeksKey && !range && gaveUp !== weeksKey;

  // Keyboard users: focus follows the cursor day (once the days are there).
  useEffect(() => {
    if (!cursor || !focusDays.current || waiting) return;
    grid.current?.querySelector<HTMLElement>(`[data-date="${cursor}"]`)?.focus({ preventScroll: true });
  }, [cursor, viewMonth, waiting]);

  const go = (next: string) => {
    setCursor(next);
    setViewMonth(next.slice(0, 7));
  };
  const pick = (d: string) => {
    if (onPick) onPick(d);
    else if (hrefFor) router.push(hrefFor(d));
  };

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
      focusDays.current = true;
      go(moves[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === "Escape" && onEscape) {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
    }
  }

  const capacity = (d: string) => {
    if (!range) return 0;
    if (d in range.limits) return range.limits[d];
    return !range.weekends && [0, 6].includes(parse(d).getDay()) ? 0 : range.perDay;
  };
  const plan = (d: string) => range?.days[d];
  // Meetings on the viewer's own local day.
  const meetingsByDay = new Map<string, { id: string; t: string; at: string; cancelled: boolean }[]>();
  for (const m of range?.meetings ?? []) {
    const k = isoDay(new Date(m.at));
    meetingsByDay.set(k, [...(meetingsByDay.get(k) ?? []), m]);
  }

  // Until the browser has told us what day it is: the same box, shimmering (1.27.5: it was empty).
  if (!viewMonth || !monthStart)
    return (
      <div aria-hidden className={`flex flex-col ${fit ? "h-full min-h-0" : "h-[338px]"} ${className}`}>
        <div className={`flex items-center justify-center flex-shrink-0 ${fit ? "h-7 mb-1" : "h-8 mb-2"}`}>
          <span className="skeleton block w-24 h-3.5 rounded-md" />
        </div>
        <div className="grid grid-cols-7 mb-1 flex-shrink-0">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={`text-center text-[10.5px] font-bold uppercase ${i >= 5 ? "text-ink-faint" : "text-ink-soft"}`}>
              {w}
            </span>
          ))}
        </div>
        <DaysSkeleton fit={fit} />
      </div>
    );

  const peekPlan = peek ? plan(peek) ?? { shorts: [], longs: [] } : undefined;
  const peekMeetings = peek ? meetingsByDay.get(peek) ?? [] : [];

  return (
    <div ref={root} className={`relative flex flex-col ${fit ? "h-full min-h-0" : ""} ${className}`}>
      <div className={`flex items-center justify-between flex-shrink-0 ${fit ? "mb-1" : "mb-2"}`}>
        <button type="button" onClick={() => go(addMonths(cursor, -1))} className={`${fit ? "w-7 h-7" : "w-8 h-8"} rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2`} aria-label="Previous month">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <span className={`${fit ? "text-[13px]" : "text-[14px]"} font-semibold truncate`} aria-live="polite">
          {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button type="button" onClick={() => go(addMonths(cursor, 1))} className={`${fit ? "w-7 h-7" : "w-8 h-8"} rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2`} aria-label="Next month">
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1 flex-shrink-0">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={`text-center text-[10.5px] font-bold uppercase ${i >= 5 ? "text-ink-faint" : "text-ink-soft"}`}>
            {w}
          </span>
        ))}
      </div>

      {peek && peekPlan && peekPlan.shorts.length + peekPlan.longs.length + peekMeetings.length > 0 && (
        <Leaves>
          <div
            className={`absolute left-0 right-0 ${peekAt ? "" : "top-0"} z-10 overflow-hidden rounded-xl border border-line/15 bg-surface shadow-2xl p-2.5 pop-menu pointer-events-none`}
            style={
              peekAt
                ? peekAt.below
                  ? { top: peekAt.bottom + 10, maxHeight: Math.max(64, peekAt.height - peekAt.bottom - 10) }
                  : // A little higher above the row: clear of the fingertip.
                    { bottom: peekAt.height - peekAt.top + 14, maxHeight: Math.max(64, peekAt.top - 14) }
                : undefined
            }
            role="status"
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5">
              {parse(peek).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
            <ul className="space-y-1">
              {peekMeetings.map((m) => (
                <li key={m.id} className={`flex items-center gap-2 text-[12.5px] ${m.cancelled ? "text-ink-soft line-through" : "text-ink"}`}>
                  <span className="w-2 h-2 rounded-[3px] flex-shrink-0 bg-violet" />
                  <span className="font-mono text-ink-faint text-[11px]">{new Date(m.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="truncate">{m.t}</span>
                </li>
              ))}
              {[...peekPlan.longs.map((x) => ({ ...x, k: "long" as const })), ...peekPlan.shorts.map((x) => ({ ...x, k: "short" as const }))].slice(0, 7).map((x, i) => (
                <li key={i} className="flex items-center gap-2 text-[12.5px] text-ink">
                  <span className={`w-2 h-2 rounded-[2px] flex-shrink-0 ${x.k === "long" ? "bg-long" : "bg-short"}`} />
                  <span className="font-mono text-ink-faint text-[11px]">#{x.n}</span>
                  <span className="truncate flex-1 min-w-0">{x.t}</span>
                  {/* Posted: the filled tick at the end (the title stays readable), as on the Calendar page. */}
                  {x.done && <PostedTick />}
                </li>
              ))}
            </ul>
            {peekPlan.shorts.length + peekPlan.longs.length > 7 && (
              <div className="text-[11.5px] text-ink-soft mt-1">and {peekPlan.shorts.length + peekPlan.longs.length - 7} more</div>
            )}
          </div>
        </Leaves>
      )}

      {waiting ? (
        <DaysSkeleton fit={fit} busy />
      ) : (
      <div
        key={viewMonth}
        ref={grid}
        role="grid"
        aria-label={monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        onKeyDown={onGridKey}
        className={`grid grid-cols-7 gap-0.5 animate-[fadein_.25s_ease] ${fit ? "grid-rows-6 flex-1 min-h-0" : ""}`}
      >
        {days.map((d, index) => {
          const info = dayInfo?.(d) ?? null;
          const p = plan(d);
          const shortsN = info ? info.count : p?.shorts.length ?? 0;
          const longsN = p?.longs.length ?? 0;
          const meetingsN = (meetingsByDay.get(d) ?? []).filter((m) => !m.cancelled).length;
          const limit = info ? info.limit : capacity(d);
          const full = shortsN > 0 && shortsN >= limit;
          const selected = d === value;
          const isToday = d === today;
          const isCursor = d === cursor;
          const inMonth = d.slice(0, 7) === viewMonth;
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              data-date={d}
              tabIndex={isCursor ? 0 : -1}
              aria-selected={selected}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${parse(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${
                shortsN ? `, ${shortsN} short${shortsN === 1 ? "" : "s"}${limit ? ` of ${limit}` : ""}` : ""
              }${longsN ? `, ${longsN} long video${longsN === 1 ? "" : "s"}` : ""}${meetingsN ? `, ${meetingsN} meeting${meetingsN === 1 ? "" : "s"}` : ""}`}
              onClick={() => {
                if (held.current) {
                  held.current = false;
                  return;
                }
                setCursor(d);
                pick(d);
              }}
              onMouseEnter={() => {
                setPeekAt(null);
                setPeek(shortsN + longsN + meetingsN ? d : null);
              }}
              onMouseLeave={() => setPeek((x) => (x === d ? null : x))}
              // Phones: press and hold a day to see what's planned (the card
              // opens above that row, or below it for the top three rows).
              onTouchStart={(e) => {
                held.current = false;
                if (!(shortsN + longsN + meetingsN)) return;
                const cell = e.currentTarget.getBoundingClientRect();
                const box = root.current?.getBoundingClientRect();
                holdTimer.current = setTimeout(() => {
                  held.current = true;
                  if (box) setPeekAt({ top: cell.top - box.top, bottom: cell.bottom - box.top, height: box.height, below: Math.floor(index / 7) < 3 });
                  setPeek(d);
                }, 420);
              }}
              onTouchEnd={() => {
                if (holdTimer.current) clearTimeout(holdTimer.current);
                if (held.current) setTimeout(() => setPeek((x) => (x === d ? null : x)), 1600);
              }}
              onTouchMove={() => holdTimer.current && clearTimeout(holdTimer.current)}
              style={{ WebkitTouchCallout: "none" }}
              className={`relative ${fit ? "min-h-0 h-full text-[12.5px]" : "h-10 text-[13px]"} select-none rounded-lg flex flex-col items-center justify-center tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                selected
                  ? "bg-amber text-white font-bold"
                  : `${isCursor ? "bg-surface-2 ring-1 ring-line/25" : "hover:bg-surface-2"} ${isToday ? "text-amber font-bold" : inMonth ? "text-ink" : "text-ink-faint"}`
              } ${today && d < today && !selected ? "opacity-55" : ""}`}
            >
              <span className={fit ? "-mt-1" : ""}>{Number(d.slice(8))}</span>
              {meetingsN > 0 && (
                <span className={`absolute ${fit ? "top-[3px] right-[3px]" : "top-1 right-1"} w-[5px] h-[5px] rounded-[2px] ${selected ? "bg-white" : "bg-violet"}`} aria-hidden />
              )}
              {shortsN + longsN > 0 && (
                <span className={`absolute ${fit ? "bottom-[2px]" : "bottom-1"} flex items-center gap-[2px]`} aria-hidden>
                  {Array.from({ length: Math.min(shortsN, longsN ? 2 : 3) }).map((_, i) => (
                    <span
                      key={`s${i}`}
                      className={`w-[5px] h-[5px] rounded-[1.5px] ${selected ? (full ? "bg-white" : "border border-white") : full ? "bg-short" : "border-[1.5px] border-short"}`}
                    />
                  ))}
                  {Array.from({ length: Math.min(longsN, shortsN ? 1 : 2) }).map((_, i) => (
                    <span key={`l${i}`} className={`w-[5px] h-[5px] rounded-[1.5px] ${selected ? "bg-white" : "bg-long"}`} />
                  ))}
                  {shortsN + longsN > 3 && <span className={`text-[8px] leading-none font-bold ${selected ? "text-white" : "text-ink-soft"}`}>+</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      )}

      <div className={`flex items-center justify-between flex-shrink-0 border-t border-line/10 ${fit ? "mt-1 pt-1" : "mt-2 pt-2"}`}>
        <span className="flex items-center">
          <button
            type="button"
            onClick={() => {
              if (onPick) onPick(today);
              else go(today);
            }}
            className={`rounded-lg px-2.5 ${fit ? "h-7" : "h-8"} text-[12.5px] font-semibold text-amber hover:bg-amber/10`}
          >
            Today
          </button>
          {onClear && value && (
            <button
              type="button"
              onClick={async () => {
                if (await confirmClear({ ...CLEAR_DATE_CONFIRM, confirmLabel: clearLabel })) onClear();
              }}
              title={clearLabel}
              className={`rounded-lg px-2 ${fit ? "h-7" : "h-8"} text-[12.5px] font-semibold text-ink-soft hover:text-red hover:bg-red/10`}>
              Clear
            </button>
          )}
        </span>
        <Legend compact={narrow || (!!onClear && !!value)} />
      </div>
    </div>
  );
}

/** planned · full · long — the key for the little squares under each day. */
export function Legend({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const item = (square: string, label: string) => (
    <span className="inline-flex items-center gap-1" title={compact ? label : undefined}>
      <span className={`w-[7px] h-[7px] rounded-[2px] ${square}`} />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
  return (
    <span className={`flex items-center ${compact ? "gap-1.5" : "gap-2"} text-[11px] text-ink-soft whitespace-nowrap ${className}`}>
      {item("border-[1.5px] border-short", "planned")}
      {item("bg-short", "full")}
      {item("bg-long", "long")}
      {item("bg-violet", "meeting")}
    </span>
  );
}

/** The six weeks while they load: a shimmering square where each day goes. */
function DaysSkeleton({ fit, busy = false }: { fit?: boolean; busy?: boolean }) {
  return (
    <div className={`grid grid-cols-7 gap-0.5 ${fit ? "grid-rows-6 flex-1 min-h-0" : ""}`} {...(busy ? { role: "status", "aria-busy": true, "aria-label": "Loading the month" } : { "aria-hidden": true })}>
      {Array.from({ length: 42 }, (_, i) => (
        <span key={i} className={`${fit ? "min-h-0 h-full" : "h-10"} rounded-lg flex items-center justify-center`} aria-hidden>
          <span className="skeleton block w-[58%] h-[58%] max-w-7 max-h-7 rounded-md" />
        </span>
      ))}
    </div>
  );
}
