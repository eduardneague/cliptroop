"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { loadDashAudience, loadDashProduction, type DashAudience, type DashProduction } from "@/app/(dashboard)/analytics/actions";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Mascot } from "@/components/ui/mascot";
import { fmtCompact, fmtInt } from "@/modules/analytics/components/charts";
import { lastIndex } from "@/modules/analytics/lib/trend-math";
import { pointAt, pointX, slotAt, slotMid, viewsWeek } from "@/modules/analytics/lib/day-graph";
import { countryName } from "@/modules/analytics/components/world-map";
import { AudienceMapView, layerFor, MAP_MODES, type MapMode, type MapView } from "@/modules/analytics/components/audience-map";
import { useBox } from "./widget-box";
import { FilterChips } from "./filter-chips";
import { followerGains, sumSeries } from "@/modules/analytics/lib/followers";

/*
 * Analytics on the dashboard. Each widget asks the server for its numbers
 * when it appears (on the board or in the widget library); widgets of the
 * same kind share one request, kept for 5 minutes.
 */

const PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;
type P = (typeof PLATFORMS)[number];
const NAME: Record<P, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const COLOR: Record<P, string> = { youtube: "rgb(var(--chart-yt))", instagram: "rgb(var(--chart-ig))", tiktok: "rgb(var(--chart-tt))", facebook: "rgb(var(--chart-fb))" };
const isP = (v: unknown): v is P => PLATFORMS.includes(v as P);

type Loaded<T> = { state: "loading" } | { state: "error"; error: string } | { state: "ok"; data: T };
const caches = { audience: new Map<string, { at: number; p: Promise<Loaded<DashAudience>> }>(), production: new Map<string, { at: number; p: Promise<Loaded<DashProduction>> }>() };

function useLoaded<T>(cache: Map<string, { at: number; p: Promise<Loaded<T>> }>, teamId: string, load: (teamId: string) => Promise<{ error: string } | { error?: undefined; data: T }>): Loaded<T> {
  const [res, setRes] = useState<{ key: string; v: Loaded<T> } | null>(null);
  useEffect(() => {
    let alive = true;
    let hit = cache.get(teamId);
    if (!hit || Date.now() - hit.at > 5 * 60_000) {
      hit = {
        at: Date.now(),
        p: load(teamId)
          .then((r): Loaded<T> => (r.error !== undefined ? { state: "error", error: r.error } : { state: "ok", data: r.data }))
          .catch((): Loaded<T> => ({ state: "error", error: "Couldn't load the numbers." })),
      };
      cache.set(teamId, hit);
    }
    void hit.p.then((v) => {
      if (v.state === "error") cache.delete(teamId);
      if (alive) setRes({ key: teamId, v });
    });
    return () => {
      alive = false;
    };
  }, [cache, teamId, load]);
  return res?.key === teamId ? res.v : { state: "loading" };
}

const anyNum = (xs: (number | null)[]) => xs.some((x) => x !== null);

function Loading({ rows = 2 }: { rows?: number }) {
  return (
    <div className="h-full flex flex-col gap-2" aria-hidden>
      <div className="skeleton rounded-md h-7 w-24" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`skeleton rounded-md h-3 ${["w-3/4", "w-1/2", "w-2/3"][i % 3]}`} />
      ))}
    </div>
  );
}

function Note({ text, href, link }: { text: string; href?: string; link?: string }) {
  const box = useBox();
  return (
    <div className="h-full flex items-center gap-3 animate-[fadein_.3s_ease]">
      {box.w >= 220 && box.h >= 70 && <Mascot mood="idle" size={Math.max(44, Math.min(72, box.h - 24))} />}
      <div className="min-w-0">
        <p className="text-[12.5px] text-ink-soft leading-snug">{text}</p>
        {href && (
          <Link href={href} className="text-[12.5px] font-semibold text-amber hover:brightness-110">
            {link} →
          </Link>
        )}
      </div>
    </div>
  );
}

/** Not connected / no numbers yet / error: the same friendly line everywhere. */
function audienceGate(r: Loaded<DashAudience>) {
  if (r.state === "loading") return <Loading />;
  if (r.state === "error") return <Note text={r.error} />;
  const a = r.data.audience;
  if (!a.status.some((s) => s.connected && s.statsReady)) return <Note text="Connect YouTube, Instagram or TikTok (and allow stats) to see your numbers here." href="/team?tab=accounts#connected-accounts" link="Connected accounts" />;
  if (!a.hasData) return <Note text="Numbers arrive with the first sync." href="/analytics?tab=overview" link="Analytics" />;
  return null;
}

function Delta({ now, prev }: { now: number; prev: number | null }) {
  if (prev === null || prev === 0) return null;
  const d = ((now - prev) / prev) * 100;
  if (!Number.isFinite(d)) return null;
  const up = d >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 h-5 text-[11px] font-bold ${Math.round(d) === 0 ? "bg-surface-2 text-ink-soft" : up ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
      {Math.round(d) !== 0 && (
        <svg viewBox="0 0 10 10" className={`w-2.5 h-2.5 ${up ? "" : "rotate-180"}`} aria-hidden>
          <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
        </svg>
      )}
      {`${up ? "+" : "−"}${Math.abs(d) >= 10 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(1)}%`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// A day of a graph, pointed at (1.34.5, the owner: "i want to be able to hover over each part of the graphs and get
// a popup with the followers directly or views").
// ---------------------------------------------------------------------------

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Which day of a graph is pointed at: under the mouse, or under a finger. A tap shows that day instead of opening
 * Analytics (the numbers above still open it), dragging along goes from day to day, and the page still scrolls up
 * and down. It goes when the mouse leaves, at a touch anywhere else, and on any scroll (the popup would stay behind).
 */
function useDayPointer(n: number, indexAt: (x: number, width: number) => number) {
  const [day, setDay] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const finger = useRef(false);
  useEffect(() => {
    if (day === null) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setDay(null);
    };
    const gone = () => setDay(null);
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", gone, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", gone, { capture: true });
    };
  }, [day]);
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, indexAt(e.clientX - r.left, r.width)));
  };
  const bind = {
    ref,
    style: { touchAction: "pan-y" } as React.CSSProperties,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      finger.current = e.pointerType !== "mouse";
      if (finger.current) setDay(at(e));
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" || e.buttons) setDay(at(e));
    },
    onPointerLeave: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse") setDay(null);
    },
    onClick: (e: React.MouseEvent) => {
      if (finger.current) e.preventDefault();
    },
  };
  return [day !== null && day < n ? day : null, bind] as const;
}

/**
 * The day's popup: beside the day (to its right, to its left near the edge), level with the top of the graph, kept
 * inside the window. In a portal, so the widget's rounded corners can't cut it off.
 */
function DayTip({ host, x, children }: { host: React.RefObject<HTMLElement | null>; x: (width: number) => number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = host.current?.getBoundingClientRect();
    if (!el || !box) return;
    const w = el.offsetWidth;
    const at = box.left + x(box.width);
    const left = at + 14 + w <= Math.min(box.right + 24, window.innerWidth - 8) ? at + 14 : at - 14 - w;
    el.style.left = `${Math.round(Math.max(8, Math.min(left, window.innerWidth - w - 8)))}px`;
    el.style.top = `${Math.round(Math.max(8, box.top))}px`;
    el.style.visibility = "visible";
  });
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ visibility: "hidden", left: 0, top: 0 }}
      className="pointer-events-none fixed z-[90] min-w-[128px] max-w-[220px] rounded-xl border border-line/15 bg-surface shadow-xl px-3 py-2 text-[12px] leading-snug"
    >
      {children}
    </div>,
    document.body
  );
}

/** A popup's first line: the day. */
function TipDay({ day }: { day: string }) {
  return <div className="text-[11px] font-semibold text-ink-faint">{longDay(day)}</div>;
}

/** Every platform's number for the day, under the total. */
function TipRows({ rows }: { rows: { p: P; text: React.ReactNode }[] }) {
  return (
    <div className="mt-1.5 pt-1.5 border-t border-line/10 space-y-0.5">
      {rows.map(({ p, text }) => (
        <div key={p} className="flex items-center gap-1.5">
          <PlatformIcon platform={p} className="w-3.5 h-3.5 rounded-[3px]" />
          <span className="text-ink-soft">{NAME[p]}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums whitespace-nowrap">{text}</span>
        </div>
      ))}
    </div>
  );
}

/** What's left under the numbers, and its size; the graph is drawn only when that's tall enough to read (the words can wrap). */
function GraphRoom({ children }: { children: (size: { w: number; h: number }) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative flex-1 min-h-0 mt-3">
      {size.h >= 28 && size.w > 0 && children(size)}
    </div>
  );
}

/** The first and last day under a graph, and what it shows (when there's room). */
function DayAxis({ days, what, wide }: { days: string[]; what: string; wide: boolean }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-ink-faint tabular-nums flex-shrink-0">
      <span>{shortDay(days[0])}</span>
      {wide && <span className="truncate">{what}</span>}
      <span>{shortDay(days[days.length - 1])}</span>
    </div>
  );
}

/**
 * The platforms under a graph, as filters (Views and Followers): each with its number, which is the number you see
 * when you pick it; a narrow widget shows the logos only (the numbers are in their names). The choice is saved with
 * the dashboard. Arrow keys move between them. 1.35.1: the chips are `FilterChips`, shared with Upcoming shorts and
 * Upcoming longs.
 */
function PlatformChips({
  list,
  shown,
  onPick,
  num,
  name,
  wide,
}: {
  list: P[];
  shown: P | "all";
  onPick: (v: P | "all") => void;
  num: (p: P | "all") => number;
  name: (p: P | "all", n: number) => string;
  wide: boolean;
}) {
  const options = (["all", ...list] as (P | "all")[]).map((p) => {
    const n = num(p);
    return { id: p, name: name(p, n), face: p === "all" ? <span className="pl-0.5">All</span> : <PlatformIcon platform={p} className="w-4 h-4 rounded-[4px]" />, count: fmtCompact(n) };
  });
  return <FilterChips label="Platform" options={options} value={shown} onPick={onPick} counts={wide} className="mt-2 flex-wrap flex-shrink-0" />;
}

/** The platform picked on a widget: what's saved with the dashboard, and changing it (saved again). */
function usePlatformPick(settings: Record<string, unknown> | undefined, onSettings: ((s: Record<string, unknown>) => void) | undefined) {
  const saved: P | "all" = isP(settings?.platform) ? settings!.platform : "all";
  const [pick, setPick] = useState<P | "all">(saved);
  useEffect(() => setPick(saved), [saved]);
  const choose = (v: P | "all") => {
    setPick(v);
    onSettings?.({ platform: v });
  };
  return [pick, choose] as const;
}

// ---------------------------------------------------------------------------
// Views: the last 7 days, the views of each day of the last 28, each platform as a filter.
// ---------------------------------------------------------------------------

/** Views each day as a line that fills its room; the day pointed at gets a guide, a dot and its popup. */
function ViewsLine({ values, color, w, h, label, tip }: { values: (number | null)[]; color: string; w: number; h: number; label: string; tip: (i: number) => React.ReactNode }) {
  const n = values.length;
  const pad = 5;
  const x = (i: number) => pointX(i, w, n, pad);
  const [day, bind] = useDayPointer(n, (px, width) => pointAt(px, width, n, pad));
  const pts = values.flatMap((v, i) => (v === null ? [] : [[i, v] as const]));
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p[1]));
  const min = Math.min(...pts.map((p) => p[1]));
  const span = max - min || 1;
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - 2 * pad);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  const v = day === null ? null : values[day];
  return (
    <div {...bind} role="img" aria-label={label} className="absolute inset-0">
      <svg width={w} height={h} className="block overflow-visible" aria-hidden>
        {day !== null && <line x1={x(day)} x2={x(day)} y1={0} y2={h} stroke="rgb(var(--line) / 0.22)" strokeWidth={1} />}
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {day !== null && v !== null ? (
          <circle cx={x(day)} cy={y(v)} r={4.5} fill={color} stroke="rgb(var(--surface))" strokeWidth={2} />
        ) : (
          <circle cx={x(last[0])} cy={y(last[1])} r={3} fill={color} stroke="rgb(var(--surface))" strokeWidth={1.5} />
        )}
      </svg>
      {day !== null && (
        <DayTip host={bind.ref} x={() => x(day)}>
          {tip(day)}
        </DayTip>
      )}
    </div>
  );
}

/**
 * Views (1.34.5): the views of the last 7 days and the change on the 7 before; each day of the last 28 as a line
 * (point at a day for its views); and the platforms as filters under it, like Followers' (it used to list their
 * numbers only).
 */
export function ViewsWidget({ teamId, settings, onSettings }: { teamId: string; settings?: Record<string, unknown>; onSettings?: (s: Record<string, unknown>) => void }) {
  const r = useLoaded(caches.audience, teamId, loadDashAudience);
  const box = useBox();
  const [pick, choose] = usePlatformPick(settings, onSettings);
  const gate = audienceGate(r);
  if (gate || r.state !== "ok") return gate;
  const a = r.data.audience;
  const active = PLATFORMS.filter((p) => anyNum(a.views[p]));
  const shown: P | "all" = pick !== "all" && active.includes(pick) ? pick : "all";
  // Up to the last day the platforms picked have all reported, the last 7 of those days against the 7 before.
  const week = (p: P | "all") => viewsWeek(p === "all" ? PLATFORMS.map((q) => a.views[q]) : [a.views[p]], a.days.length);
  const wk = week(shown);
  const sel = shown === "all" ? active : [shown];
  // Days the line doesn't reach yet: the numbers say which week they are, and whose numbers are missing.
  const upTo = wk.cut >= 0 && wk.cut < a.days.length - 1 ? shortDay(a.days[wk.cut]) : null;
  const late = sel.filter((p) => lastIndex(a.views[p]) <= wk.cut);
  const whose = shown === "all" ? "views" : `${NAME[shown]} views`;
  const caption = upTo ? `${whose} in the 7 days to ${upTo}` : `${whose} in the last 7 days`;
  const before = wk.prev7 !== null ? ` · ${fmtCompact(wk.prev7)} the 7 before` : "";
  const color = shown === "all" ? "rgb(var(--amber))" : COLOR[shown];
  const line = wk.line.filter((v) => v !== null).length >= 2;
  const tip = (i: number) => {
    const v = wk.line[i];
    return (
      <>
        <TipDay day={a.days[i]} />
        <div className="mt-0.5 text-[13px] tabular-nums">
          {v !== null ? (
            <>
              <b className="font-bold text-ink">{fmtInt(v)}</b> <span className="text-ink-soft">views</span>
            </>
          ) : (
            <span className="text-ink-soft">{i > wk.cut ? (sel.length > 1 ? "Not all in yet" : "Not in yet") : "No numbers that day"}</span>
          )}
        </div>
        {sel.length > 1 && (
          <TipRows
            rows={sel.map((p) => {
              const x = a.views[p][i];
              return { p, text: x === null ? <span className="font-normal text-ink-faint">{i > lastIndex(a.views[p]) ? "not in yet" : "–"}</span> : fmtInt(x) };
            })}
          />
        )}
      </>
    );
  };
  return (
    <div className="h-full flex flex-col min-h-0">
      <Link href="/analytics?tab=overview" className="flex-1 min-h-0 flex flex-col rounded-lg -m-1 p-1 hover:bg-surface-2/40 transition-colors">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-display text-[28px] leading-none font-semibold tabular-nums">{fmtCompact(wk.last7)}</span>
          <Delta now={wk.last7} prev={wk.prev7} />
        </div>
        {/* A small widget keeps it to one line (all of it on hover), so the graph still has room. */}
        <span
          className={`text-[11.5px] text-ink-faint mt-1 ${box.h < 200 ? "truncate" : ""}`}
          title={[caption + before, upTo && late.length ? `No numbers yet from ${late.map((p) => NAME[p]).join(" and ")} for the days after ${upTo}.` : ""].filter(Boolean).join(". ")}
        >
          {caption}
          {box.h >= 200 || box.w >= 330 ? before : ""}
        </span>
        {line ? (
          <GraphRoom>
            {({ w, h }) => (
              <ViewsLine
                values={wk.line}
                color={color}
                w={w}
                h={h}
                label={`${shown === "all" ? "Views" : `${NAME[shown]} views`} per day, ${shortDay(a.days[0])} to ${shortDay(a.days[Math.max(0, wk.cut)])}`}
                tip={tip}
              />
            )}
          </GraphRoom>
        ) : (
          <p className="mt-auto pt-2 text-[11.5px] text-ink-faint leading-snug">Views per day show here once there are two days of numbers.</p>
        )}
        {line && box.h >= 150 && <DayAxis days={a.days} what="views per day" wide={box.w >= 260} />}
      </Link>
      {active.length > 1 && (
        <PlatformChips
          list={active}
          shown={shown}
          onPick={choose}
          num={(p) => week(p).last7}
          name={(p, n) => `${p === "all" ? "All platforms" : NAME[p]}: ${fmtInt(n)} views`}
          wide={box.w >= 330}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Followers: how many now, and the new ones each day of the last 28.
// ---------------------------------------------------------------------------

const PEOPLE: Record<P, string> = { youtube: "subscribers", instagram: "followers", tiktok: "followers", facebook: "followers" };
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtCompact(Math.abs(n))}`;
const signedInt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtInt(Math.abs(n))}`;

/**
 * New followers each day as bars (1.34.4, the owner: "i want to see growth / per day to see the nice graph here"):
 * a day's gain up from the line, a day that lost some down (red). It fills the box it's put in (GraphRoom gives it
 * what's left under the numbers). The day pointed at is lit, with its popup (1.34.5).
 */
function GainBars({
  days,
  values,
  color,
  lostColor = "rgb(var(--red) / 0.75)",
  tip,
}: {
  days: string[];
  values: (number | null)[];
  color: string;
  lostColor?: string;
  tip: (i: number) => React.ReactNode;
}) {
  const n = values.length;
  // Each day has an equal slot, 2px apart (the gap-[2px] below).
  const [day, bind] = useDayPointer(n, (x, w) => slotAt(x, w, n));
  const pos = Math.max(0, ...values.map((v) => v ?? 0));
  const neg = Math.max(0, ...values.map((v) => -(v ?? 0)));
  const range = pos + neg || 1;
  // The zero line, from the bottom (%): at the bottom unless some day lost followers.
  const zero = (neg / range) * 100;
  const total = values.reduce<number>((s, v) => s + (v ?? 0), 0);
  return (
    <div {...bind} role="img" aria-label={`New followers per day, ${shortDay(days[0])} to ${shortDay(days[days.length - 1])}: ${signed(total)} in all`} className="absolute inset-0 flex items-stretch gap-[2px]">
      <span aria-hidden className="absolute inset-x-0 h-px bg-line/25" style={{ bottom: `${zero}%` }} />
      {values.map((v, i) => (
        <span key={days[i] ?? i} className={`relative flex-1 rounded-[3px] transition-colors ${day === i ? "bg-ink/[0.07]" : ""}`}>
          {v !== null && v !== 0 && (
            <span
              aria-hidden
              className="absolute inset-x-[12%] min-h-[2px] rounded-[2px]"
              style={v > 0 ? { bottom: `${zero}%`, height: `${(v / range) * 100}%`, background: color } : { top: `${100 - zero}%`, height: `${(-v / range) * 100}%`, background: lostColor }}
            />
          )}
        </span>
      ))}
      {day !== null && (
        <DayTip host={bind.ref} x={(w) => slotMid(day, w, n)}>
          {tip(day)}
        </DayTip>
      )}
    </div>
  );
}

/**
 * Followers (1.34.4): how many now and the change over 28 days, the new
 * ones each day as bars (point at a day for its number, 1.34.5), and the
 * platforms as filters under it (each with its count; the choice is saved
 * with the dashboard, like Top videos'). It used to draw the running total,
 * a flat line at any size, and the platforms were only numbers.
 */
export function FollowersWidget({ teamId, settings, onSettings }: { teamId: string; settings?: Record<string, unknown>; onSettings?: (s: Record<string, unknown>) => void }) {
  const r = useLoaded(caches.audience, teamId, loadDashAudience);
  const box = useBox();
  const [pick, choose] = usePlatformPick(settings, onSettings);
  const gate = audienceGate(r);
  if (gate || r.state !== "ok") return gate;
  const a = r.data.audience;
  const list = PLATFORMS.filter((p) => a.followersNow[p] !== undefined);
  if (!list.length) return <Note text="Follower counts arrive with the next sync." href="/analytics?tab=audience" link="Analytics" />;
  const shown: P | "all" = pick !== "all" && list.includes(pick) ? pick : "all";
  const sel = shown === "all" ? list : [shown];
  const count = (ps: readonly P[]) => ps.reduce((s, p) => s + (a.followersNow[p] ?? 0), 0);
  const total = count(sel);
  const nets = sel.map((p) => a.perPlatform[p]?.followersNet ?? null).filter((x): x is number => x !== null);
  const net = nets.length ? nets.reduce((x, y) => x + y, 0) : null;
  const per = sel.map((p) => ({ p, gains: followerGains(a.days.length, a.followersDaily?.[p], a.followersFlow?.[p]) }));
  const gains = sumSeries(
    per.map((x) => x.gains),
    a.days.length
  );
  const bars = gains.filter((v) => v !== null).length >= 2;
  const color = shown === "all" ? "rgb(var(--amber))" : COLOR[shown];
  const what = shown === "all" ? (list.length > 1 ? "followers on every platform" : `${NAME[list[0]]} ${PEOPLE[list[0]]}`) : `${NAME[shown]} ${PEOPLE[shown]}`;
  const people = sel.length === 1 ? PEOPLE[sel[0]] : "followers";
  const tip = (i: number) => {
    const v = gains[i];
    return (
      <>
        <TipDay day={a.days[i]} />
        <div className="mt-0.5 text-[13px] tabular-nums">
          {v === null ? (
            <span className="text-ink-soft">No count that day</span>
          ) : v === 0 ? (
            <span className="text-ink-soft">No new {people}</span>
          ) : (
            <>
              <b className={`font-bold ${v > 0 ? "text-green" : "text-red"}`}>{v > 0 ? signedInt(v) : fmtInt(-v)}</b>{" "}
              <span className="text-ink-soft">{v > 0 ? `new ${people}` : `${people} lost`}</span>
            </>
          )}
        </div>
        {per.length > 1 && <TipRows rows={per.map(({ p, gains: g }) => ({ p, text: g[i] === null ? <span className="font-normal text-ink-faint">–</span> : signedInt(g[i]!) }))} />}
      </>
    );
  };
  return (
    <div className="h-full flex flex-col min-h-0">
      <Link href="/analytics?tab=audience" className="flex-1 min-h-0 flex flex-col rounded-lg -m-1 p-1 hover:bg-surface-2/40 transition-colors">
        <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
          <span className="font-display text-[28px] leading-none font-semibold tabular-nums">{fmtCompact(total)}</span>
          {net !== null && (
            <span className="text-[12px] tabular-nums whitespace-nowrap">
              {net !== 0 && <b className={net > 0 ? "text-green" : "text-red"}>{signed(net)} </b>}
              <span className="text-ink-faint">{net === 0 ? "no change in 28 days" : "in 28 days"}</span>
            </span>
          )}
        </div>
        {box.h >= 170 && <span className="text-[11.5px] text-ink-faint mt-1 truncate">{what}</span>}
        {bars ? (
          <GraphRoom>
            {/* YouTube's own colour is a red: a day it lost subscribers is grey there. */}
            {() => <GainBars days={a.days} values={gains} color={color} lostColor={shown === "youtube" ? "rgb(var(--ink) / 0.35)" : undefined} tip={tip} />}
          </GraphRoom>
        ) : (
          <p className="mt-auto pt-2 text-[11.5px] text-ink-faint leading-snug">New {people} per day show here once there are two days of counts.</p>
        )}
        {bars && box.h >= 150 && <DayAxis days={a.days} what={`new ${people} per day`} wide={box.w >= 260} />}
      </Link>
      {list.length > 1 && (
        <PlatformChips
          list={list}
          shown={shown}
          onPick={choose}
          num={(p) => (p === "all" ? count(list) : a.followersNow[p]!)}
          name={(p, n) => (p === "all" ? `All platforms: ${fmtInt(n)}` : `${NAME[p]}: ${fmtInt(n)} ${PEOPLE[p]}`)}
          wide={box.w >= 330}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top videos of the last 28 days.
// ---------------------------------------------------------------------------

const ago = (iso: string) => {
  const d = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};


/** How many Top videos lists (1.35.1: the 20 best, scrolling; was as many as fit, at most 12). */
export const TOP_SHOWN = 20;

/**
 * Top videos (1.27.5): every platform together or one at a time, from the
 * chips on top (or the widget's settings); the choice is saved with the
 * dashboard. 1.35.1 (the owner: "i want to be able to scroll inside it so
 * theres like the top 20 videos and a button to see view all on the top
 * right too"): the 20 best, in a list that scrolls inside the widget, and
 * "View all" in its top right corner (`topVideosHref`, the board's card);
 * the chips are Followers' (`FilterChips`).
 */
export function TopVideosWidget({ teamId, settings, onSettings }: { teamId: string; settings?: Record<string, unknown>; onSettings?: (s: Record<string, unknown>) => void }) {
  const r = useLoaded(caches.audience, teamId, loadDashAudience);
  const box = useBox();
  const [pick, choose] = usePlatformPick(settings, onSettings);
  const gate = audienceGate(r);
  if (gate || r.state !== "ok") return gate;
  const withViews = r.data.top.filter((t) => t.views !== null);
  // Only platforms that have videos here get a chip.
  const has = PLATFORMS.filter((p) => withViews.some((t) => t.platform === p));
  const shown: P | "all" = pick !== "all" && has.includes(pick) ? pick : "all";
  const items = (shown === "all" ? withViews : withViews.filter((t) => t.platform === shown)).slice(0, TOP_SHOWN);
  const chips = has.length > 1 && box.h >= 90;
  if (!withViews.length) return <Note text="Nothing published in the last 28 days yet." href="/analytics?tab=content" link="Content" />;
  const thumbs = box.w >= 260;
  const rowH = thumbs ? 50 : 34;
  const max = items[0]?.views ?? 1;
  const named = box.w >= 420;
  return (
    <div className="h-full flex flex-col min-h-0">
      {chips && (
        <FilterChips
          label="Platform"
          options={(["all", ...has] as (P | "all")[]).map((p) => ({
            id: p,
            name: p === "all" ? "Every platform together" : NAME[p],
            face:
              p === "all" ? (
                <span className="px-0.5">All</span>
              ) : (
                <>
                  <PlatformIcon platform={p} className="w-4 h-4 rounded-[4px]" />
                  {named && NAME[p]}
                </>
              ),
          }))}
          value={shown}
          onPick={choose}
          className="mb-1.5 flex-shrink-0 overflow-x-auto no-scrollbar"
        />
      )}
      {!items.length ? (
        <Note text={`No ${shown === "all" ? "" : `${NAME[shown]} `}videos with views in the last 28 days.`} />
      ) : (
        <ol key={shown} aria-label={`The ${items.length} most viewed${shown === "all" ? "" : ` on ${NAME[shown]}`}, last 28 days`} className="flex-1 min-h-0 widget-scroll -mx-1 motion-stagger">
          {items.map((v, i) => (
            <li key={`${v.platform}${v.id}`}>
              {/* Each opens the video's own analytics (1.17.0). */}
              <Link href={v.noNumbers ? "/analytics?tab=content" : `/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=dashboard`} className="flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-surface-2/70" style={{ height: rowH }}>
                <span className="w-4 text-[11px] font-bold text-ink-faint tabular-nums text-center flex-shrink-0">{i + 1}</span>
                {thumbs && (
                  <span className="relative w-[64px] h-[36px] rounded-md overflow-hidden bg-surface-2 flex-shrink-0">
                    {v.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                    )}
                    <PlatformIcon platform={v.platform} className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-[3px]" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {!thumbs && <PlatformIcon platform={v.platform} className="w-3.5 h-3.5 rounded-[3px] flex-shrink-0" />}
                    <span className="block text-[12.5px] font-semibold truncate">{v.title || "Untitled"}</span>
                  </span>
                  {thumbs && (
                    <span className="mt-1 flex items-center gap-2">
                      <span className="flex-1 h-1 rounded-[2px] bg-line/[0.07] overflow-hidden" aria-hidden>
                        <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, ((v.views ?? 0) / max) * 100)}%`, background: COLOR[v.platform] }} />
                      </span>
                      {v.publishedAt && box.w >= 360 && <span className="text-[10.5px] text-ink-faint whitespace-nowrap">{ago(v.publishedAt)}</span>}
                    </span>
                  )}
                </span>
                <span className="text-[12px] font-bold tabular-nums flex-shrink-0">{fmtCompact(v.views)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audience map: YouTube views by country, last 28 days.
// ---------------------------------------------------------------------------

/** Settings: shows a flat map or a 3D globe, of one platform's countries or all together. */
export function AudienceMapWidget({ teamId, settings }: { teamId: string; settings?: Record<string, unknown> }) {
  const r = useLoaded(caches.audience, teamId, loadDashAudience);
  const box = useBox();
  const gate = audienceGate(r);
  if (gate || r.state !== "ok") return gate;
  const view: MapView = settings?.view === "globe" ? "globe" : "map";
  const mode: MapMode = MAP_MODES.some((m) => m.id === settings?.mode) ? (settings!.mode as MapMode) : "all";
  const layer = layerFor(r.data.audience, mode);
  const rows = layer.rows;
  const total = rows.reduce((s, c) => s + c.value, 0);
  const side = box.w >= 520 && box.h >= 150;
  // Tall and narrow (phones, stacked): the map on top, the leading countries
  // underneath with bars, two per row. Otherwise a short line of the top 3.
  const ROW = 30;
  const pairs = box.w >= 280;
  const wantH = view === "globe" ? Math.min(box.w, box.h - 3 * ROW - 10) : box.w / 2.28;
  const mapH = side ? box.h : Math.max(100, Math.min(wantH, box.h - 26));
  const listRows = side ? 0 : Math.floor((box.h - mapH - 10) / ROW);
  const below = !side && total > 0 && listRows >= 2;
  // The list underneath: up to 8, and only countries that round to at least 1%.
  const shown = below ? rows.filter((c) => c.value / total >= 0.005) : rows;
  const top = shown.slice(0, side ? Math.max(3, Math.min(8, Math.floor((box.h - 10) / 24))) : below ? Math.min(8, listRows * (pairs ? 2 : 1)) : 3);
  const mapW = side ? box.w - 190 : box.w;
  const fits = view === "globe" ? Math.min(mapW, side ? box.h : mapH) : Math.min(mapW, (side ? box.h : mapH) * 2.28);
  const ytReady = r.data.audience.status.some((s) => s.platform === "youtube" && s.connected && s.statsReady);
  const pct = (v: number) => Math.round((v / total) * 100);
  const most = top.length ? top[0].value : 1;
  return (
    <div className={`h-full min-h-0 ${side ? "flex items-center gap-4" : "flex flex-col"}`}>
      <div className={side ? "flex-1 min-w-0 flex justify-center" : `${below ? "flex-shrink-0" : "flex-1 min-h-0"} flex items-center justify-center`}>
        <div style={{ width: Math.max(120, fits) }}>
          <AudienceMapView a={r.data.audience} mode={mode} view={view} youtubeReady={ytReady} compact globeSize={Math.max(120, fits)} />
        </div>
      </div>
      {total > 0 &&
        (side ? (
          <ol className="w-[170px] flex-shrink-0 space-y-1">
            {top.map((c) => (
              <li key={c.code} className="flex items-center gap-2 text-[12px]">
                <span className="flex-1 truncate text-ink-soft">{countryName(c.code)}</span>
                <b className="tabular-nums">{pct(c.value)}%</b>
              </li>
            ))}
          </ol>
        ) : below ? (
          <ol className={`pt-3 grid gap-x-4 gap-y-2 ${pairs ? "grid-cols-2" : "grid-cols-1"}`}>
            {top.map((c) => (
              <li key={c.code} className="min-w-0">
                <div className="flex items-center gap-2 text-[12px] leading-tight">
                  <span className="flex-1 truncate text-ink-soft">{countryName(c.code)}</span>
                  <b className="tabular-nums">{pct(c.value)}%</b>
                </div>
                <div className="mt-1 h-1 rounded-[2px] bg-line/10 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-[3px] bg-amber" style={{ width: `${Math.max(3, (c.value / most) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1.5 text-[11.5px] text-ink-soft truncate">
            {top.map((c, i) => (
              <span key={c.code}>
                {i > 0 && " · "}
                {countryName(c.code)} <b className="text-ink tabular-nums">{pct(c.value)}%</b>
              </span>
            ))}
          </p>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// This week: our own output (no platform needed).
// ---------------------------------------------------------------------------

export function OutputWidget({ teamId }: { teamId: string }) {
  const r = useLoaded(caches.production, teamId, loadDashProduction);
  const box = useBox();
  if (r.state === "loading") return <Loading />;
  if (r.state === "error") return <Note text={r.error} />;
  const k = r.data.kpis;
  // Narrow (two small tiles a row): the short words, so none is cut off (1.27.5).
  const tight = box.w < 230;
  const tiles = [
    { key: "s", label: tight ? "Shorts" : "Shorts out", value: fmtInt(k.shortsPosted.value), extra: <Delta now={k.shortsPosted.value ?? 0} prev={k.shortsPosted.prev} />, dot: "rgb(var(--chart-short))" },
    { key: "l", label: tight ? "Longs" : "Long videos", value: fmtInt(k.longsPublished.value), dot: "rgb(var(--chart-long))" },
    { key: "o", label: "On time", value: k.onTime.value === null ? "–" : `${Math.round(k.onTime.value)}%` },
    { key: "d", label: tight ? "Overdue" : "Overdue now", value: fmtInt(k.overdueNow), tone: k.overdueNow > 0 ? "text-red" : "text-green" },
  ];
  const cols = box.w >= 400 ? 4 : 2;
  const show = box.h >= 120 || cols === 4 ? tiles : tiles.slice(0, 2);
  return (
    <Link href="/analytics?tab=production&range=7d" className="h-full grid gap-2 rounded-lg -m-1 p-1 hover:bg-surface-2/40 transition-colors" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {show.map((t) => (
        <div key={t.key} className="rounded-lg bg-surface-2/50 px-2.5 py-2 min-w-0 flex flex-col justify-center">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-soft truncate">
            {t.dot && <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: t.dot }} aria-hidden />}
            {t.label}
          </span>
          <span className="flex items-center gap-1.5 mt-0.5">
            <span className={`font-display text-[22px] leading-none font-semibold tabular-nums ${t.tone ?? ""}`}>{t.value}</span>
            {box.w >= 260 && t.extra}
          </span>
        </div>
      ))}
    </Link>
  );
}
