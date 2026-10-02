"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { switchTeam } from "@/app/(dashboard)/actions";
import { getPlannedDays, type PlannedDay } from "@/app/(dashboard)/calendar/planned-days";
import type { TeamCard } from "../lib/queries";
import { localDay } from "./tasks-widget";

function Face({ m, className = "w-7 h-7 text-[10px]" }: { m: TeamCard["members"][number]; className?: string }) {
  return m.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.avatarUrl} alt={m.name} title={m.name} className={`${className} rounded-full object-cover ring-2 ring-surface`} />
  ) : (
    <span title={m.name} className={`${className} rounded-full ring-2 ring-surface flex items-center justify-center font-bold text-white`} style={{ background: m.color }}>
      {m.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Overlapping profile pictures: up to 5, then "+N" (opens everyone). */
export function AvatarStack({ team, onMore }: { team: TeamCard; onMore: () => void }) {
  const shown = team.members.slice(0, 5);
  const extra = team.members.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((m, i) => (
        <span key={m.id} className={i ? "-ml-2" : ""} style={{ zIndex: 10 - i }}>
          <Face m={m} />
        </span>
      ))}
      {extra > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
          className="-ml-2 h-7 min-w-7 px-1.5 rounded-full ring-2 ring-surface bg-surface-2 text-[11px] font-bold text-ink-soft hover:text-ink"
        >
          +{extra}
        </button>
      )}
    </div>
  );
}

export function TeamsWidget({ teams, currentTeamId }: { teams: TeamCard[]; currentTeamId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [members, setMembers] = useState<TeamCard | null>(null);
  return (
    <div className="space-y-2">
      {teams.map((t) => {
        const current = t.id === currentTeamId;
        return (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => !current && start(async () => { await switchTeam(t.id); router.refresh(); })}
            onKeyDown={(e) => e.key === "Enter" && !current && start(async () => { await switchTeam(t.id); router.refresh(); })}
            className={`rounded-xl border p-3 transition-colors ${current ? "border-amber/50 bg-amber/[0.05]" : "border-line/10 hover:border-line/30 cursor-pointer"} ${pending ? "opacity-60" : ""}`}
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              {t.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logoUrl} alt="" className="w-7 h-7 rounded-lg object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold" style={{ background: t.color }}>
                  {t.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="text-[14px] font-semibold truncate flex-1">{t.name}</span>
              {current && <span className="rounded-md bg-amber/15 text-amber px-1.5 h-5 inline-flex items-center text-[10.5px] font-bold">Current</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <AvatarStack team={t} onMore={() => setMembers(t)} />
              <button type="button" onClick={(e) => { e.stopPropagation(); setMembers(t); }} className="text-[11.5px] text-ink-soft hover:text-ink">
                {t.members.length} member{t.members.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        );
      })}
      <Dialog open={!!members} onClose={() => setMembers(null)} title={members?.name ?? ""} description={`${members?.members.length ?? 0} members`}>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {members?.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 rounded-lg bg-surface-2/50 px-2.5 py-2">
              <Face m={m} className="w-8 h-8 text-[11px]" />
              <span className="text-[13.5px] font-semibold truncate">{m.name}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

/** A real clock face with moving hands, plus the digital time and date. */
function AnalogClock({ now, seconds }: { now: Date; seconds: boolean }) {
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const sec = now.getSeconds();
  const hourDeg = h * 30 + m * 0.5;
  const minDeg = m * 6 + sec * 0.1;
  const secDeg = sec * 6;
  const hand = (deg: number, len: number, w: number, color: string) => (
    <line x1="50" y1="50" x2="50" y2={50 - len} stroke={color} strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg} 50 50)`} style={{ transition: "transform .3s cubic-bezier(.4,2.3,.6,1)" }} />
  );
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" role="img" aria-label={now.toLocaleTimeString()}>
      <circle cx="50" cy="50" r="47" fill="rgb(var(--surface-2))" stroke="rgb(var(--line) / 0.2)" strokeWidth="1.5" />
      {Array.from({ length: 60 }, (_, i) => (
        <line
          key={i}
          x1="50"
          y1={i % 5 ? 7 : 6}
          x2="50"
          y2={i % 5 ? 9 : 13}
          stroke={i % 5 ? "rgb(var(--line) / 0.35)" : "rgb(var(--ink) / 0.75)"}
          strokeWidth={i % 5 ? 0.8 : 2}
          strokeLinecap="round"
          transform={`rotate(${i * 6} 50 50)`}
        />
      ))}
      {hand(hourDeg, 24, 4, "rgb(var(--ink))")}
      {hand(minDeg, 34, 2.6, "rgb(var(--ink))")}
      {seconds && hand(secDeg, 38, 1.2, "rgb(var(--amber))")}
      <circle cx="50" cy="50" r="3" fill="rgb(var(--amber))" />
    </svg>
  );
}

export function ClockWidget({ settings }: { settings?: Record<string, unknown> }) {
  const h24 = settings?.h24 !== false;
  const secondHand = settings?.secondHand !== false;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="h-[120px]" />;
  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <div className="w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0">
        <AnalogClock now={now} seconds={secondHand} />
      </div>
      <div className="min-w-0">
        <div className="font-display text-[34px] sm:text-[40px] font-semibold leading-none tabular-nums tracking-tight">
          {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: !h24 })}
        </div>
        <div className="text-[13.5px] text-ink-soft mt-2 leading-snug">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
        <div className="text-[12px] text-ink-faint">{Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}</div>
      </div>
    </div>
  );
}

export function MiniCalendarWidget() {
  const [month, setMonth] = useState(() => localDay().slice(0, 7));
  const [planned, setPlanned] = useState<Record<string, PlannedDay>>({});
  const days = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00`);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return localDay(d);
    });
  }, [month]);
  useEffect(() => {
    let alive = true;
    getPlannedDays(days[0], days[41]).then((r) => alive && setPlanned(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [days]);
  const today = localDay();
  const shift = (n: number) => {
    const d = new Date(`${month}-01T00:00:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(localDay(d).slice(0, 7));
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="w-7 h-7 rounded-md text-ink-soft hover:text-ink hover:bg-surface-2">‹</button>
        <span className="text-[13.5px] font-semibold">{new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="w-7 h-7 rounded-md text-ink-soft hover:text-ink hover:bg-surface-2">›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10.5px] font-bold text-ink-faint mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const p = planned[d];
          const s = p?.shorts.length ?? 0;
          const l = p?.longs.length ?? 0;
          return (
            <Link
              key={d}
              href={`/calendar?date=${d}`}
              title={s + l ? `${s} short${s === 1 ? "" : "s"}, ${l} long video${l === 1 ? "" : "s"}` : undefined}
              className={`relative h-9 rounded-lg flex items-center justify-center text-[12.5px] tabular-nums transition-colors hover:bg-surface-2 ${
                d === today ? "bg-amber text-white font-bold hover:bg-amber" : d.slice(0, 7) === month ? "text-ink" : "text-ink-faint"
              }`}
            >
              {Number(d.slice(8))}
              {s + l > 0 && (
                <span className="absolute bottom-1 flex gap-[2px]">
                  {Array.from({ length: Math.min(s, l ? 1 : 2) }).map((_, i) => (
                    <span key={`s${i}`} className={`w-1 h-1 rounded-[1px] ${d === today ? "bg-white" : "bg-short"}`} />
                  ))}
                  {Array.from({ length: Math.min(l, s ? 1 : 2) }).map((_, i) => (
                    <span key={`l${i}`} className={`w-1 h-1 rounded-[1px] ${d === today ? "bg-white" : "bg-long"}`} />
                  ))}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
