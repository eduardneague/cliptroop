"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KindIcon } from "@/components/ui/kind-icon";
import type { Done, Task } from "../lib/queries";

export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
};

/** "Overdue" · "Today" · "Tomorrow" · "Fri, Oct 9". */
export function DueChip({ due, today }: { due: string | null; today: string }) {
  if (!due) return null;
  const late = due < today;
  const label =
    due === today ? "Today" : due === addDays(today, 1) ? "Tomorrow" : late ? "Overdue" : new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <span
      className={`flex-shrink-0 rounded-md px-2 h-6 inline-flex items-center text-[11.5px] font-bold ${
        late ? "bg-red/12 text-red" : due === today ? "bg-amber/12 text-amber" : "bg-surface-2 text-ink-soft"
      }`}
      title={new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
    >
      {label}
    </span>
  );
}

/** One task: what to do, on which video, where it is, when it's due. */
export function TaskRow({ t, today }: { t: Task; today: string }) {
  const color = t.kind === "short" ? "rgb(var(--short))" : "rgb(var(--long))";
  return (
    <Link
      href={t.href}
      className={`group flex items-center gap-3 rounded-xl border border-line/10 bg-surface-2/20 p-2.5 transition-colors hover:border-line/30 hover:bg-surface-2/50 ${t.state === "waiting" ? "opacity-75 hover:opacity-100" : ""}`}
    >
      {t.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.thumb} alt="" className="w-[88px] aspect-video rounded-lg object-cover flex-shrink-0 bg-surface-2" />
      ) : (
        <span className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `color-mix(in srgb, ${color} 13%, transparent)` }}>
          <KindIcon kind={t.kind} className="w-5 h-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-tight truncate">{t.action}</span>
        <span className="block text-[12.5px] text-ink-soft truncate mt-0.5">
          <span className="font-mono text-ink-faint">#{t.number}</span> {t.title}
        </span>
        <span className="flex items-center gap-2 mt-1.5">
          {/* Where the video is in its steps */}
          <span className="flex gap-[3px]" aria-label={`Step ${t.step} of ${t.steps}`}>
            {Array.from({ length: t.steps }, (_, i) => (
              <span key={i} className="w-3.5 h-1 rounded-[2px]" style={{ background: i < t.step ? color : "rgb(var(--line) / 0.2)" }} />
            ))}
          </span>
          <span className="text-[11.5px] text-ink-faint truncate">
            {t.state === "waiting" && t.currentStageLabel ? `Starts after ${t.currentStageLabel}` : t.stageLabel}
          </span>
        </span>
      </span>
      <span className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <DueChip due={t.dueDate} today={today} />
        <span className="text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity text-[15px] leading-none">→</span>
      </span>
    </Link>
  );
}

function Group({ label, tone, tasks, today }: { label: string; tone?: "red" | "amber"; tasks: Task[]; today: string }) {
  if (!tasks.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide mb-1.5 ${tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : "text-ink-faint"}`}>
        {label}
        <span className="rounded-md bg-line/10 px-1.5 text-ink-soft">{tasks.length}</span>
      </div>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <TaskRow key={t.id} t={t} today={today} />
        ))}
      </div>
    </div>
  );
}

/** My tasks: a summary, then Today · Upcoming · Done, grouped. */
export function TasksWidget({ tasks, done, settings }: { tasks: Task[]; done: Done[]; settings?: Record<string, unknown> }) {
  const today = localDay();
  const [tab, setTab] = useState<"today" | "upcoming" | "done">(((settings?.tab as string) ?? "today") as "today");
  const g = useMemo(() => {
    const active = tasks.filter((t) => t.state === "active");
    const overdue = active.filter((t) => t.dueDate && t.dueDate < today);
    const dueToday = active.filter((t) => t.dueDate === today);
    const noDate = active.filter((t) => !t.dueDate);
    const future = active.filter((t) => t.dueDate && t.dueDate > today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);
    return {
      overdue,
      dueToday,
      noDate,
      tomorrow: future.filter((t) => t.dueDate === tomorrow),
      week: future.filter((t) => t.dueDate! > tomorrow && t.dueDate! <= weekEnd),
      later: future.filter((t) => t.dueDate! > weekEnd),
      waiting: tasks.filter((t) => t.state === "waiting").sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    };
  }, [tasks, today]);
  const nowCount = g.overdue.length + g.dueToday.length + g.noDate.length;
  const upCount = g.tomorrow.length + g.week.length + g.later.length + g.waiting.length;
  const doneByDay = useMemo(() => {
    const m = new Map<string, Done[]>();
    for (const d of done.slice(0, 60)) {
      const k = localDay(new Date(d.at));
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()];
  }, [done]);
  const dayName = (d: string) => (d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }));

  const tiles = [
    { label: "Overdue", n: g.overdue.length, tab: "today" as const, cls: g.overdue.length ? "text-red" : "text-ink-faint" },
    { label: "Due today", n: g.dueToday.length + g.noDate.length, tab: "today" as const, cls: g.dueToday.length + g.noDate.length ? "text-amber" : "text-ink-faint" },
    { label: "Coming up", n: upCount, tab: "upcoming" as const, cls: "text-ink" },
  ];

  return (
    <div className="flex flex-col min-h-0">
      <div className="grid grid-cols-3 gap-2 mb-3">
        {tiles.map((x) => (
          <button key={x.label} type="button" onClick={() => setTab(x.tab)} className="rounded-xl border border-line/10 bg-surface-2/30 px-3 py-2.5 text-left hover:border-line/30 transition-colors">
            <div className={`text-[24px] font-bold leading-none tabular-nums ${x.cls}`}>{x.n}</div>
            <div className="text-[11.5px] text-ink-soft mt-1">{x.label}</div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 mb-3" role="tablist">
        {(
          [
            ["today", "Today", nowCount],
            ["upcoming", "Upcoming", upCount],
            ["done", "Done", null],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-[13px] font-semibold transition-colors ${tab === k ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {label}
            {n !== null && n > 0 && <span className={`rounded-md px-1.5 text-[11px] font-bold ${k === "today" ? "bg-amber text-white" : "bg-line/15 text-ink-soft"}`}>{n}</span>}
          </button>
        ))}
      </div>

      <div key={tab} className="space-y-4 max-h-[460px] overflow-y-auto -mr-2 pr-2 animate-[modalin_.18s_var(--ease-out)]">
        {tab === "today" &&
          (nowCount ? (
            <>
              <Group label="Overdue" tone="red" tasks={g.overdue} today={today} />
              <Group label="Due today" tone="amber" tasks={g.dueToday} today={today} />
              <Group label="No date" tasks={g.noDate} today={today} />
            </>
          ) : (
            <Empty icon="🎉" text="Nothing due today. Nice." />
          ))}
        {tab === "upcoming" &&
          (upCount ? (
            <>
              <Group label="Tomorrow" tasks={g.tomorrow} today={today} />
              <Group label="This week" tasks={g.week} today={today} />
              <Group label="Later" tasks={g.later} today={today} />
              <Group label="Waiting on earlier steps" tasks={g.waiting} today={today} />
            </>
          ) : (
            <Empty icon="🗓️" text="Nothing coming up yet." />
          ))}
        {tab === "done" &&
          (doneByDay.length ? (
            doneByDay.map(([day, list]) => (
              <div key={day}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-1.5">
                  {dayName(day)} <span className="rounded-md bg-line/10 px-1.5 text-ink-soft">{list.length}</span>
                </div>
                <div className="space-y-1">
                  {list.map((d) => (
                    <Link key={d.id} href={d.href} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-surface-2/60">
                      <span className="w-8 h-8 rounded-lg bg-green/12 text-green flex items-center justify-center flex-shrink-0 text-[13px] font-bold">✓</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold truncate">{d.action}</span>
                        <span className="block text-[12px] text-ink-soft truncate">
                          <span className="font-mono text-ink-faint">#{d.number}</span> {d.title}
                        </span>
                      </span>
                      <span className="text-[11.5px] text-ink-faint tabular-nums">{new Date(d.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <Empty icon="✓" text="Finished tasks show up here." />
          ))}
      </div>
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="py-10 text-center">
      <div className="text-[28px] mb-1">{icon}</div>
      <p className="text-[13.5px] text-ink-soft">{text}</p>
    </div>
  );
}
