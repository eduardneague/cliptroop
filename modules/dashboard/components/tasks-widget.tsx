"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { KindIcon } from "@/components/ui/kind-icon";
import { CheckIcon } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/mascot";
import { useBox } from "./widget-box";
import type { Done, Task } from "../lib/queries";

export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
};
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** "Overdue" · "Today" · "Tomorrow" · "Fri" (this week) · "Oct 9". */
export function DueChip({ due, today }: { due: string | null; today: string }) {
  if (!due) return null;
  const late = due < today;
  const inWeek = due > today && due <= addDays(today, 6);
  const label =
    due === today
      ? "Today"
      : due === addDays(today, 1)
        ? "Tomorrow"
        : late
          ? due === addDays(today, -1)
            ? "Yesterday"
            : shortDate(due)
          : inWeek
            ? new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })
            : shortDate(due);
  return (
    <span
      className={`flex-shrink-0 rounded-[5px] px-1.5 h-5 inline-flex items-center text-[11px] font-bold tabular-nums ${
        late ? "bg-red/12 text-red" : due === today ? "bg-amber/12 text-amber" : "bg-surface-2 text-ink-soft"
      }`}
      title={new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
    >
      {label}
    </span>
  );
}

/** One task on one line pair: what to do, on which video, when. */
export function TaskRow({ t, today }: { t: Task; today: string }) {
  const late = t.state === "active" && !!t.dueDate && t.dueDate < today;
  const waiting = t.state === "waiting";
  return (
    <Link
      href={t.href}
      title={t.kind === "meeting" ? `${t.action} (from ${t.title})` : `${t.action}: #${t.number} ${t.title} (${t.stageLabel}, step ${t.step} of ${t.steps})`}
      className={`group relative flex items-center gap-2.5 rounded-lg pl-2 pr-1.5 py-1.5 transition-colors hover:bg-surface-2/70 ${waiting ? "opacity-70 hover:opacity-100" : ""}`}
    >
      {late && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-red" aria-hidden />}
      {t.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.thumb} alt="" className="w-[46px] h-[26px] rounded-[5px] object-cover flex-shrink-0 bg-surface-2" />
      ) : (
        <span className={`w-[26px] h-[26px] rounded-[6px] flex items-center justify-center flex-shrink-0 ${t.kind === "short" ? "bg-short/12" : t.kind === "meeting" ? "bg-violet/12" : "bg-long/12"}`}>
          <KindIcon kind={t.kind} className="w-3.5 h-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13px] font-semibold truncate">{t.action}</span>
        <span className="block text-[11.5px] text-ink-soft truncate">
          {t.kind === "meeting" ? <span className="text-ink-faint">From </span> : <span className="font-mono text-ink-faint">#{t.number}</span>} {t.title}
          {waiting && t.currentStageLabel && <span className="text-ink-faint"> · after {t.currentStageLabel}</span>}
        </span>
      </span>
      <DueChip due={t.dueDate} today={today} />
    </Link>
  );
}

function Section({ label, tasks, today }: { label?: string; tasks: Task[]; today: string }) {
  if (!tasks.length) return null;
  return (
    <div>
      {label && (
        <div className="sticky top-0 z-[1] bg-surface flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
          {label} <span className="font-semibold">{tasks.length}</span>
        </div>
      )}
      <div className="motion-stagger">
        {tasks.map((t) => (
          <TaskRow key={t.id} t={t} today={today} />
        ))}
      </div>
    </div>
  );
}

/** What comes after today, kept quiet: one faint line each. */
function NextUp({ tasks, today, onMore }: { tasks: Task[]; today: string; onMore: () => void }) {
  if (!tasks.length) return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-line/10 flex-shrink-0">
      <div className="flex items-center px-2 pb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint/80 flex-1">Next up</span>
        <button type="button" onClick={onMore} className="text-[10.5px] font-semibold text-ink-faint hover:text-ink">
          See all
        </button>
      </div>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>
            <Link href={t.href} title={t.kind === "meeting" ? `${t.action} (from ${t.title})` : `${t.action}: #${t.number} ${t.title}`} className="flex items-center gap-2 rounded-md px-2 py-[3px] text-[11.5px] text-ink-soft hover:bg-surface-2/60 hover:text-ink transition-colors">
              <span className={`w-1.5 h-1.5 rounded-[2px] flex-shrink-0 ${t.kind === "short" ? "bg-short/70" : t.kind === "meeting" ? "bg-violet/70" : "bg-long/70"}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {t.action} <span className="text-ink-faint">· {t.kind === "meeting" ? t.title : `#${t.number} ${t.title}`}</span>
              </span>
              <span className="text-[10.5px] text-ink-faint tabular-nums flex-shrink-0">{t.dueDate ? dueLabel(t.dueDate, today) : ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const dueLabel = (due: string, today: string) =>
  due === addDays(today, 1)
    ? "Tomorrow"
    : due > today && due <= addDays(today, 6)
      ? new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })
      : shortDate(due);

/** Today is clear: Clippy celebrates. */
/**
 * How much room an element has (its own box, kept up to date). Clippy is
 * sized from this so he fills the free space in the widget, big and cheerful.
 */
function useRoom<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setRoom({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, room] as const;
}

/** Clippy's size: as big as the free space allows (text underneath needs `reserve` px). */
function clipSize(room: { w: number; h: number } | null, box: { w: number; h: number }, reserve: number, max = 230) {
  const h = room ? room.h - reserve : box.h * 0.5;
  const w = room ? room.w * 0.7 : box.w * 0.55;
  return Math.round(Math.max(72, Math.min(max, h, w)));
}

function AllDone({ overdue, onOverdue }: { overdue: number; onOverdue: () => void }) {
  const box = useBox();
  const [ref, room] = useRoom<HTMLDivElement>();
  if (overdue) {
    const size = clipSize(room, box, 64, 180);
    return (
      <div ref={ref} className="h-full min-h-[140px] flex flex-col items-center justify-center text-center gap-1 px-3 animate-[fadein_.3s_ease]">
        <Mascot mood="idle" size={size} />
        <p className="text-[13.5px] font-semibold mt-1">Nothing else due today</p>
        <button type="button" onClick={onOverdue} className="text-[12.5px] font-semibold text-red hover:underline">
          {overdue} task{overdue === 1 ? " is" : "s are"} overdue
        </button>
      </div>
    );
  }
  const size = clipSize(room, box, 60);
  return (
    <div ref={ref} className="h-full min-h-[160px] flex flex-col items-center justify-center text-center px-3 animate-[fadein_.3s_ease]">
      <Mascot mood="celebrate" size={size} />
      <p className={`font-display font-semibold leading-tight mt-1.5 ${size >= 150 ? "text-[20px]" : "text-[17px]"}`}>All done for today!</p>
      <p className="text-[12.5px] text-ink-soft mt-0.5">You&rsquo;ve completed all your tasks for today.</p>
    </div>
  );
}

/** Nothing overdue: a calmer, still roomy Clippy. */
function NothingOverdue() {
  const box = useBox();
  const [ref, room] = useRoom<HTMLDivElement>();
  return (
    <div ref={ref} className="h-full min-h-[140px] flex flex-col items-center justify-center text-center gap-1 animate-[fadein_.3s_ease]">
      <Mascot mood="idle" size={clipSize(room, box, 44, 160)} />
      <p className="text-[12.5px] text-ink-soft mt-1">Nothing overdue. Nice.</p>
    </div>
  );
}

type Tab = "overdue" | "today" | "upcoming" | "all" | "done";

/** My tasks: tabs (Overdue in red when anything is late), compact rows. */
export function TasksWidget({ tasks, done, settings }: { tasks: Task[]; done: Done[]; settings?: Record<string, unknown> }) {
  const today = localDay();
  const g = useMemo(() => {
    const byDue = (a: Task, b: Task) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.number - b.number;
    const active = tasks.filter((t) => t.state === "active");
    const future = active.filter((t) => t.dueDate && t.dueDate > today).sort(byDue);
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);
    return {
      overdue: active.filter((t) => t.dueDate && t.dueDate < today).sort(byDue),
      today: [...active.filter((t) => t.dueDate === today), ...active.filter((t) => !t.dueDate)],
      tomorrow: future.filter((t) => t.dueDate === tomorrow),
      week: future.filter((t) => t.dueDate! > tomorrow && t.dueDate! <= weekEnd),
      later: future.filter((t) => t.dueDate! > weekEnd),
      waiting: tasks.filter((t) => t.state === "waiting").sort(byDue),
      all: tasks.filter((t) => t.state !== "done").sort(byDue),
    };
  }, [tasks, today]);
  const upCount = g.tomorrow.length + g.week.length + g.later.length + g.waiting.length;
  // All done for today: Next up stays short so Clippy gets the room.
  const nextUp = useMemo(() => [...g.tomorrow, ...g.week, ...g.later].slice(0, g.today.length ? 3 : 2), [g]);
  const wanted = (settings?.tab as Tab | undefined) ?? "today";
  const [tab, setTab] = useState<Tab>(wanted);

  const doneByDay = useMemo(() => {
    const m = new Map<string, Done[]>();
    for (const d of done.slice(0, 60)) {
      const k = localDay(new Date(d.at));
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()];
  }, [done]);
  const dayName = (d: string) =>
    d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  const tabs: { k: Tab; label: string; n: number | null; red?: boolean }[] = [
    { k: "overdue", label: "Overdue", n: g.overdue.length, red: g.overdue.length > 0 },
    { k: "today", label: "Today", n: g.today.length },
    { k: "upcoming", label: "Upcoming", n: upCount },
    { k: "all", label: "All", n: g.all.length },
    { k: "done", label: "Done", n: null },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-0.5 mb-1.5 -mx-0.5 overflow-x-auto no-scrollbar flex-shrink-0" role="tablist">
        {tabs.map(({ k, label, n, red }) => {
          const on = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(k)}
              className={`inline-flex items-center gap-1 rounded-md px-2 h-6 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                red ? (on ? "bg-red text-white" : "text-red hover:bg-red/10") : on ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {label}
              {n !== null && n > 0 && <span className={`tabular-nums text-[11px] ${red ? (on ? "text-white/85" : "text-red") : "text-ink-faint"}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      <div key={tab} className="flex-1 min-h-0 overflow-y-auto -mx-1 px-0 animate-[fadein_.15s_ease-out]">
        {tab === "overdue" &&
          (g.overdue.length ? (
            <Section tasks={g.overdue} today={today} />
          ) : (
            <NothingOverdue />
          ))}
        {tab === "today" && (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">{g.today.length ? <Section tasks={g.today} today={today} /> : <AllDone overdue={g.overdue.length} onOverdue={() => setTab("overdue")} />}</div>
            <NextUp tasks={nextUp} today={today} onMore={() => setTab("upcoming")} />
          </div>
        )}
        {tab === "upcoming" &&
          (upCount ? (
            <>
              <Section label="Tomorrow" tasks={g.tomorrow} today={today} />
              <Section label="This week" tasks={g.week} today={today} />
              <Section label="Later" tasks={g.later} today={today} />
              <Section label="Waiting on earlier steps" tasks={g.waiting} today={today} />
            </>
          ) : (
            <Empty text="Nothing coming up yet." />
          ))}
        {tab === "all" && (g.all.length ? <Section tasks={g.all} today={today} /> : <Empty text="No tasks right now." />)}
        {tab === "done" &&
          (doneByDay.length ? (
            doneByDay.map(([day, list]) => (
              <div key={day}>
                <div className="sticky top-0 z-[1] bg-surface px-2 pt-1.5 pb-0.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
                  {dayName(day)} <span className="font-semibold">{list.length}</span>
                </div>
                {list.map((d) => (
                  <Link key={d.id} href={d.href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2/70">
                    <span className="w-[26px] h-[26px] rounded-[6px] bg-green/12 text-green flex items-center justify-center flex-shrink-0">
                      <CheckIcon className="w-3 h-3" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[13px] font-semibold truncate">{d.action}</span>
                      <span className="block text-[11.5px] text-ink-soft truncate">
                        {d.kind === "meeting" ? <span className="text-ink-faint">From</span> : <span className="font-mono text-ink-faint">#{d.number}</span>} {d.title}
                      </span>
                    </span>
                    <span className="text-[11px] text-ink-faint tabular-nums">{new Date(d.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                  </Link>
                ))}
              </div>
            ))
          ) : (
            <Empty text="Finished tasks show up here." />
          ))}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="h-full min-h-[80px] flex flex-col items-center justify-center gap-1.5 text-center">
      <span className="w-7 h-7 rounded-full bg-green/12 text-green flex items-center justify-center">
        <CheckIcon className="w-3.5 h-3.5" />
      </span>
      <p className="text-[12.5px] text-ink-soft">{text}</p>
    </div>
  );
}
