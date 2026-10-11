"use client";

import { useEffect, useRef, useState } from "react";
import { FlameIcon, TrophyIcon } from "@/components/ui/icons";
import { useCountUp } from "@/components/ui/count-up";
import { colorVar, formatAmount, unitFor } from "../lib/metrics";
import { THIS, daysBetween, timeLeft, type PeriodKind } from "../lib/periods";
import type { ObjectiveView, PersonLite } from "../lib/types";
import { HistoryBars, Meter, ObjectiveIcon, PeopleStack, StatusPill, unjudged, useWhen } from "./parts";

/** "by Sunday", "by Oct 31", "by tonight". */
export function byWhen(kind: PeriodKind, end: string) {
  if (kind === "day") return "by tonight";
  if (kind === "week") return "by Sunday";
  return `by ${new Date(`${end}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/** "about 2 a day", "about 1 every 3 days", "about 32K a day". */
export function perDayWords(metric: string, perDay: number | null) {
  if (perDay === null || !(perDay > 0)) return null;
  if (perDay < 0.95) return `about 1 every ${Math.max(2, Math.round(1 / perDay))} days`;
  return `about ${perDay < 10 ? formatAmount(metric, Math.round(perDay * 10) / 10) : formatAmount(metric, Math.round(perDay))} a day`;
}

/** The line under the meter: what's left, or when it was reached. */
export function progressWords(o: ObjectiveView, when: (iso: string | null, day: string | null) => string) {
  const c = o.current;
  if (o.paused) return "Paused: not counting for now.";
  if (c.target === 0) return `Off ${THIS[o.period]}.`;
  if (c.status === "reached") {
    const early = c.reachedDay ? daysBetween(c.reachedDay, c.end) : 0;
    const at = c.reachedAt || c.reachedDay ? `Reached ${when(c.reachedAt, c.reachedDay)}` : "Reached";
    const extra = c.value > c.target ? `, ${formatAmount(o.metric, c.value - c.target)} over` : "";
    return `${at}${early > 0 ? `, ${early} day${early === 1 ? "" : "s"} early` : ""}${extra}.`;
  }
  const left = c.target - c.value;
  if (o.period === "day") return `${formatAmount(o.metric, left)} to go today.`;
  const parts = [`${formatAmount(o.metric, left)} to go`, c.daysLeft ? timeLeft(o.period, c.daysLeft) : null, perDayWords(o.metric, c.perDay)].filter(Boolean);
  return `${parts.join(" · ")}.`;
}

/** What's next, in a few words: "4 to go · about 4 a day." (the time left sits beside the count). */
export function nextWords(o: ObjectiveView, when: (iso: string | null, day: string | null) => string) {
  const c = o.current;
  if (o.paused || c.target === 0 || c.status === "reached") return progressWords(o, when);
  const left = c.target - c.value;
  if (o.period === "day") return `${formatAmount(o.metric, left)} to go today.`;
  const per = perDayWords(o.metric, c.perDay);
  return `${formatAmount(o.metric, left)} to go${per ? ` · ${per}` : ""}.`;
}

/**
 * One objective on the page. Every card has the same shape, so a section
 * reads as a grid: what it is and how it's going, the count against the
 * target with the pace mark, what's next, its history, who helped.
 */
export function ObjectiveCard({ o, people, audienceReady, onOpen }: { o: ObjectiveView; people: Record<string, PersonLite>; audienceReady: boolean; onOpen: () => void }) {
  const c = o.current;
  const when = useWhen();
  const shown = useCountUp(c.value);
  const reached = c.status === "reached";
  const behind = c.status === "behind";
  // A card that becomes reached while you're looking flashes once.
  const was = useRef(reached);
  const [won, setWon] = useState(false);
  useEffect(() => {
    if (reached && !was.current) {
      setWon(true);
      const t = setTimeout(() => setWon(false), 1700);
      was.current = reached;
      return () => clearTimeout(t);
    }
    was.current = reached;
  }, [reached]);
  // Only periods since the goal was set (with numbers) count toward "reached X of Y".
  const past = o.history.slice(0, -1).filter((p) => p.target > 0 && !unjudged(p));
  const forecast = behind && c.forecast !== null && c.value > 0 && c.target > 0 ? `At this pace: about ${formatAmount(o.metric, c.forecast)} ${byWhen(o.period, c.end)}.` : null;
  const unit = unitFor(o.metric, c.target || o.target, o.filters);
  const left = !reached && !o.paused && c.target > 0 && c.daysLeft ? timeLeft(o.period, c.daysLeft) : null;
  // Cards of every cadence share one grid: each says which period it's counting.
  const period = THIS[o.period].charAt(0).toUpperCase() + THIS[o.period].slice(1);

  return (
    <article
      className={`relative rounded-2xl border bg-surface p-4 flex flex-col min-w-0 transition-[border-color,box-shadow] ${won ? "obj-won" : ""} ${reached ? "border-transparent" : "border-line/10 hover:border-line/25"} ${o.paused ? "opacity-70" : ""}`}
      style={{ ["--glow" as string]: colorVar(o.color, 0.35), ...(reached ? { boxShadow: `inset 0 0 0 1.5px ${colorVar(o.color, 0.55)}` } : {}) }}
    >
      <header className="flex items-start gap-2.5">
        <ObjectiveIcon icon={o.icon} platform={o.platform} color={o.color} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold leading-tight">
            <button type="button" onClick={onOpen} className="max-w-full truncate text-left hover:underline underline-offset-2 decoration-line/30" title={o.title}>
              {o.title}
            </button>
          </h3>
          <p className="text-[12px] text-ink-soft leading-snug mt-0.5 line-clamp-2">{o.sentence}</p>
        </div>
        <StatusPill status={o.paused ? "off" : c.status} />
      </header>

      <div className="mt-3.5 flex items-baseline gap-1.5 min-w-0">
        <span className="font-display text-[30px] font-semibold leading-none tabular-nums">{formatAmount(o.metric, shown)}</span>
        <span className="text-[12.5px] text-ink-soft truncate">
          of {c.target ? formatAmount(o.metric, c.target) : "no target"} {unit}
        </span>
        <span className="ml-auto text-[11.5px] text-ink-faint whitespace-nowrap flex items-center gap-1">
          {reached && <TrophyIcon className="w-3.5 h-3.5 text-gold" />}
          {period}
          {left && left !== "until midnight" ? ` · ${left}` : ""}
        </span>
      </div>
      <Meter value={c.value} target={c.target} expected={reached ? null : c.expected} color={o.color} height={8} className="mt-2.5" />
      <p className={`mt-2 text-[12.5px] leading-snug ${behind ? "text-coral" : reached ? "text-green" : "text-ink-soft"}`}>{nextWords(o, when)}</p>
      {forecast && <p className="text-[11.5px] text-ink-faint leading-snug">{forecast}</p>}
      {o.lagDays > 0 && !audienceReady && <p className="mt-1 text-[12px] text-coral">Connect an account (Team → Connected accounts) to count this.</p>}
      {!o.known && <p className="mt-1 text-[12px] text-ink-faint">Made with a newer version of the app. Refresh to see it count.</p>}

      {/* At the bottom, so cards side by side line up. */}
      <div className="mt-auto pt-3">
        <div className="pt-3 border-t border-line/10 flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <HistoryBars periods={o.history} color={o.color} kind={o.period} metric={o.metric} height={34} ticks={false} />
          </div>
          <dl className="text-right text-[11px] leading-tight space-y-0.5 flex-shrink-0">
            {o.stats.streak > 0 && (
              <div className="flex items-center justify-end gap-1 font-semibold text-ink">
                <FlameIcon className="w-3.5 h-3.5 text-coral" />
                {o.stats.streak} in a row
              </div>
            )}
            <div className="text-ink-faint">
              Best <b className="text-ink-soft font-semibold">{formatAmount(o.metric, o.stats.best)}</b>
            </div>
            {past.length > 0 && (
              <div className="text-ink-faint">
                <b className="text-ink-soft font-semibold">{past.filter((p) => p.reached).length}</b> of {past.length} reached
              </div>
            )}
          </dl>
        </div>
        <footer className="mt-2.5 flex items-center gap-2 min-h-[26px]">
          {c.contributors.length > 0 ? (
            <>
              <PeopleStack contributors={c.contributors} people={people} />
              <span className="text-[11.5px] text-ink-faint truncate">
                {c.contributors.length === 1 ? `${people[c.contributors[0].memberId]?.name ?? "Someone"} helped` : `${c.contributors.length} people helped`}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-ink-faint">{o.lagDays ? "From the platforms' numbers" : "Nothing counted yet"}</span>
          )}
          <button type="button" onClick={onOpen} className="ml-auto rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Details →
          </button>
        </footer>
      </div>
    </article>
  );
}
