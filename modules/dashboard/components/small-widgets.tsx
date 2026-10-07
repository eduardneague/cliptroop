"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { switchTeam } from "@/app/(dashboard)/actions";
import { MonthCalendar } from "@/components/ui/month-calendar";
import type { TeamCard } from "../lib/queries";
import { useBox } from "./widget-box";
import { localDay } from "./tasks-widget";

function Face({ m, className = "w-5 h-5 text-[9px]" }: { m: TeamCard["members"][number]; className?: string }) {
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
export function AvatarStack({ team, onMore, max = 5 }: { team: TeamCard; onMore: () => void; max?: number }) {
  const shown = team.members.slice(0, max);
  const extra = team.members.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((m, i) => (
        <span key={m.id} className={i ? "-ml-1.5" : ""} style={{ zIndex: 10 - i }}>
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
          className="-ml-1.5 h-5 min-w-5 px-1 rounded-full ring-2 ring-surface bg-surface-2 text-[9.5px] font-bold text-ink-soft hover:text-ink"
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
  const box = useBox();
  const go = (id: string) => start(async () => {
    await switchTeam(id);
    router.refresh();
  });
  return (
    <div className={`h-full widget-scroll -mx-1 motion-stagger ${pending ? "opacity-60" : ""}`}>
      {teams.map((t) => {
        const current = t.id === currentTeamId;
        return (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            aria-current={current || undefined}
            title={current ? `${t.name} (current team)` : `Switch to ${t.name}`}
            onClick={() => !current && go(t.id)}
            onKeyDown={(e) => e.key === "Enter" && !current && go(t.id)}
            className={`flex items-center gap-2 rounded-md px-1 py-1 transition-colors ${current ? "bg-amber/[0.07]" : "hover:bg-surface-2/70 cursor-pointer"}`}
          >
            {t.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logoUrl} alt="" className="w-6 h-6 rounded-md object-cover flex-shrink-0" />
            ) : (
              <span className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: t.color }}>
                {t.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[12.5px] font-semibold truncate">{t.name}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setMembers(t); }} className="block max-w-full truncate text-[10.5px] text-ink-faint hover:text-ink">
                {current && box.w >= 200 ? "Current · " : ""}
                {t.members.length} member{t.members.length === 1 ? "" : "s"}
              </button>
            </span>
            {box.w >= 210 && <AvatarStack team={t} max={box.w >= 300 ? 5 : 3} onMore={() => setMembers(t)} />}
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
  const box = useBox();
  if (!now) return <div className="h-full" />;
  // Wide: face beside the time. Tall: face above it. Small: just the time.
  const face = Math.min(box.h, 150);
  const side = box.w >= face + 120;
  const stacked = !side && box.h >= Math.min(box.w, 140) + 64;
  const big = Math.max(22, Math.min(40, Math.round(Math.min(box.w / 5, box.h / 3.2))));
  return (
    <div className={`h-full flex items-center ${side ? "gap-3" : stacked ? "flex-col justify-center gap-2 text-center" : "justify-center text-center"}`}>
      {(side || stacked) && (
        <div className="flex-shrink-0" style={{ width: stacked ? Math.min(box.w, box.h - 64, 150) : face, height: stacked ? Math.min(box.w, box.h - 64, 150) : face }}>
          <AnalogClock now={now} seconds={secondHand} />
        </div>
      )}
      <div className="min-w-0">
        <div className="font-display font-semibold leading-none tabular-nums tracking-tight" style={{ fontSize: side || stacked ? Math.min(big, 30) : big }}>
          {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: !h24 })}
        </div>
        <div className="text-[12px] text-ink-soft mt-1.5 leading-tight truncate">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
        <div className="text-[10.5px] text-ink-faint truncate">{Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}</div>
      </div>
    </div>
  );
}

/** The dashboard Calendar: THE calendar (same as every date picker), filling the widget. A day opens it in the big calendar. */
export function MiniCalendarWidget() {
  return <MonthCalendar fit hrefFor={(d) => `/calendar?d=${d}`} />;
}
