"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadDashAudience, loadDashProduction, type DashAudience, type DashProduction } from "@/app/(dashboard)/analytics/actions";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Mascot } from "@/components/ui/mascot";
import { fmtCompact, fmtInt } from "@/modules/analytics/components/charts";
import { countryName } from "@/modules/analytics/components/world-map";
import { AudienceMapView, layerFor, MAP_MODES, type MapMode, type MapView } from "@/modules/analytics/components/audience-map";
import { useBox } from "./widget-box";

/*
 * Analytics on the dashboard. Each widget asks the server for its numbers
 * when it appears (on the board or in the widget library); widgets of the
 * same kind share one request, kept for 5 minutes.
 */

const PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;
type P = (typeof PLATFORMS)[number];
const NAME: Record<P, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const COLOR: Record<P, string> = { youtube: "rgb(var(--chart-yt))", instagram: "rgb(var(--chart-ig))", tiktok: "rgb(var(--chart-tt))", facebook: "rgb(var(--chart-fb))" };

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

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
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

/** A tiny line of the last 28 days (no axes; the number above it carries the value). */
function Spark({ values, color, height }: { values: (number | null)[]; color: string; height: number }) {
  const box = useBox();
  const w = Math.max(60, box.w);
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p[1]), 1);
  const min = Math.min(...pts.map((p) => p[1]));
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden className="block overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last[0])} cy={y(last[1])} r={3} fill={color} stroke="rgb(var(--surface))" strokeWidth={1.5} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Views: the last 7 days, the trend over 28, each platform's share.
// ---------------------------------------------------------------------------

export function ViewsWidget({ teamId }: { teamId: string }) {
  const r = useLoaded(caches.audience, teamId, loadDashAudience);
  const box = useBox();
  const gate = audienceGate(r);
  if (gate || r.state !== "ok") return gate;
  const a = r.data.audience;
  const n = a.days.length;
  const total = a.days.map((_, i) => (PLATFORMS.some((p) => a.views[p][i] !== null) ? sum(PLATFORMS.map((p) => a.views[p][i])) : null));
  const last7 = sum(total.slice(n - 7));
  const prev7 = anyNum(total.slice(n - 14, n - 7)) ? sum(total.slice(n - 14, n - 7)) : null;
  const active = PLATFORMS.filter((p) => anyNum(a.views[p]));
  const sparkH = Math.max(0, Math.min(90, box.h - 92));
  return (
    <Link href="/analytics?tab=overview" className="h-full flex flex-col min-h-0 rounded-lg -m-1 p-1 hover:bg-surface-2/40 transition-colors">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-display text-[28px] leading-none font-semibold tabular-nums">{fmtCompact(last7)}</span>
        <Delta now={last7} prev={prev7} />
      </div>
      <span className="text-[11.5px] text-ink-faint mt-1">views in the last 7 days{prev7 !== null ? ` · ${fmtCompact(prev7)} the 7 before` : ""}</span>
      {sparkH >= 28 && (
        <div className="mt-auto pt-2">
          <Spark values={total} color="rgb(var(--amber))" height={sparkH} />
        </div>
      )}
      {box.h >= 100 && active.length > 0 && (
        <div className={`${sparkH >= 28 ? "mt-2" : "mt-auto"} flex items-center gap-x-3 gap-y-1 flex-wrap`}>
          {active.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              <PlatformIcon platform={p} className="w-4 h-4 rounded-[4px]" />
              <b className="text-ink tabular-nums">{fmtCompact(sum(a.views[p].slice(n - 7)))}</b>
              {box.w >= 330 && NAME[p]}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Followers: each platform now, and the change over 28 days.
// ---------------------------------------------------------------------------

/**
 * Followers of every platform together, per day (1.27.5): each platform's
 * count carried over days it has none (before its first count: its first
 * one), so the line doesn't jump where a platform's history starts.
 */
export function followersLine(daily: Partial<Record<P, (number | null)[]>> | undefined, days: number): (number | null)[] {
  const series = PLATFORMS.map((p) => daily?.[p]).filter((x): x is (number | null)[] => Array.isArray(x) && x.some((v) => v !== null));
  if (!series.length) return [];
  const filled = series.map((xs) => {
    const first = xs.find((v) => v !== null) ?? 0;
    let last = first;
    return Array.from({ length: days }, (_, i) => {
      const v = xs[i];
      if (v !== null && v !== undefined) last = v;
      return last;
    });
  });
  return Array.from({ length: days }, (_, i) => filled.reduce((s, xs) => s + (xs[i] ?? 0), 0));
}

/**
 * An area graph: the line, a soft fill under it, the last day's dot. It
 * fills the box it's put in (the widget gives it what's left under the
 * numbers), so it never pushes the platforms out of the widget.
 */
function AreaGraph({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map((p) => p[1]));
  const min = Math.min(...pts.map((p) => p[1]));
  // A little room above and below, so a flat line sits in the middle.
  const pad = (max - min || Math.max(1, max * 0.01)) * 0.18;
  const lo = min - pad;
  const span = max + pad - lo || 1;
  // 0–100 both ways; the line keeps its width however the box is stretched.
  const x = (i: number) => (i / (values.length - 1)) * 98 + 1;
  const y = (v: number) => 4 + (1 - (v - lo) / span) * 92;
  const line = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const area = `${line}L${x(pts[pts.length - 1][0]).toFixed(2)},100L${x(pts[0][0]).toFixed(2)},100Z`;
  const last = pts[pts.length - 1];
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 w-full h-full overflow-visible">
        <path d={area} fill={color} fillOpacity={0.13} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The dot as its own element: round in any box. */}
      <span
        aria-hidden
        className="absolute w-[7px] h-[7px] -ml-[3.5px] -mt-[3.5px] rounded-full ring-[1.5px] ring-surface"
        style={{ left: `${x(last[0])}%`, top: `${y(last[1])}%`, background: color }}
      />
    </>
  );
}

/** What's left under the numbers; the graph is drawn only when that's tall enough to read (the words can wrap). */
function GraphRoom({ title, children }: { title?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative flex-1 min-h-0 mt-3" title={title}>
      {h >= 28 && children}
    </div>
  );
}

export function FollowersWidget({ teamId }: { teamId: string }) {
  const r = useLoaded(caches.audience, teamId, loadDashAudience);
  const box = useBox();
  const gate = audienceGate(r);
  if (gate || r.state !== "ok") return gate;
  const a = r.data.audience;
  const list = PLATFORMS.filter((p) => a.followersNow[p] !== undefined);
  if (!list.length) return <Note text="Follower counts arrive with the next sync." href="/analytics?tab=audience" link="Analytics" />;
  const total = list.reduce((s, p) => s + (a.followersNow[p] ?? 0), 0);
  const net = a.totals.followersNet.value;
  // The graph (1.27.5): followers over the 28 days, all platforms together.
  const line = followersLine(a.followersDaily, a.days.length);
  const rowsH = list.length * 30;
  const rows = box.h >= 70 + rowsH + (line.length ? 70 : 0);
  // How much the numbers take (roughly): the total and its change (on two lines when narrow), and the platforms in a
  // row of small chips (as many lines as they wrap to). The graph gets exactly what's left (GraphRoom); this decides
  // whether there's room to try, and in a small box the graph wins over the chips (their numbers stay in the tooltip).
  const change = net === null ? 0 : (net === 0 ? 20 : fmtCompact(Math.abs(net)).length + 12) * 6.4;
  const headH = box.w >= fmtCompact(total).length * 17 + 8 + change ? 32 : 50;
  const perLine = Math.max(1, Math.floor((box.w + 10) / 55));
  const chipLines = Math.ceil(list.length / perLine);
  const chipsH = chipLines * 17 + (chipLines - 1) * 4 + 10;
  const withChips = box.h - headH - 12 - (rows ? rowsH + 10 : chipsH);
  const graph = line.length > 1 && (withChips >= 36 || (!rows && box.h - headH - 12 >= 44));
  const chips = rows || !graph || withChips >= 36;
  const from = line.find((v) => v !== null) ?? null;
  const breakdown = list.map((p) => `${NAME[p]} ${fmtCompact(a.followersNow[p]!)}`).join(", ");
  return (
    <Link href="/analytics?tab=audience" title={chips ? undefined : breakdown} className="h-full flex flex-col min-h-0 rounded-lg -m-1 p-1 hover:bg-surface-2/40 transition-colors">
      {/* The change says its own period, so no line of words under it: that room is the graph's (1.27.5). */}
      <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
        <span className="font-display text-[28px] leading-none font-semibold tabular-nums">{fmtCompact(total)}</span>
        {net !== null && (
          <span className="text-[12px] tabular-nums whitespace-nowrap">
            {net !== 0 && <b className={net > 0 ? "text-green" : "text-red"}>{`${net > 0 ? "+" : "−"}${fmtCompact(Math.abs(net))}`} </b>}
            <span className="text-ink-faint">{net === 0 ? "no change in 28 days" : "in 28 days"}</span>
          </span>
        )}
      </div>
      {!graph && <span className="text-[11.5px] text-ink-faint mt-1 truncate">followers in all</span>}
      {graph && (
        <GraphRoom title={from !== null ? `${fmtInt(from)} → ${fmtInt(total)} over 28 days${chips ? "" : `\n${breakdown}`}` : undefined}>
          <AreaGraph values={line} color="rgb(var(--amber))" />
        </GraphRoom>
      )}
      {!chips ? null : rows ? (
        <ul className={`${graph ? "mt-2.5" : "mt-auto pt-2"} space-y-1.5 flex-shrink-0`}>
          {list.map((p) => (
            <li key={p} className="flex items-center gap-2 text-[12.5px]">
              <PlatformIcon platform={p} className="w-5 h-5 rounded-md" />
              <span className="flex-1 text-ink-soft truncate">{NAME[p]}</span>
              <span className="w-16 h-1.5 rounded-[3px] bg-line/[0.07] overflow-hidden hidden min-[300px]:block" aria-hidden>
                <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(4, ((a.followersNow[p] ?? 0) / Math.max(1, ...list.map((x) => a.followersNow[x] ?? 0))) * 100)}%`, background: COLOR[p] }} />
              </span>
              <b className="tabular-nums w-14 text-right">{fmtCompact(a.followersNow[p]!)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${graph ? "mt-2.5" : "mt-auto"} flex items-center gap-x-2.5 gap-y-1 flex-wrap flex-shrink-0`}>
          {list.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 text-[11.5px]" title={NAME[p]}>
              <PlatformIcon platform={p} className="w-3.5 h-3.5 rounded-[4px]" />
              <b className="tabular-nums">{fmtCompact(a.followersNow[p]!)}</b>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Top videos of the last 28 days.
// ---------------------------------------------------------------------------

const ago = (iso: string) => {
  const d = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

const isP = (v: unknown): v is P => PLATFORMS.includes(v as P);

/**
 * Top videos (1.27.5): every platform together or one at a time, from the
 * chips on top (or the widget's settings); the choice is saved with the
 * dashboard.
 */
export function TopVideosWidget({ teamId, settings, onSettings }: { teamId: string; settings?: Record<string, unknown>; onSettings?: (s: Record<string, unknown>) => void }) {
  const r = useLoaded(caches.audience, teamId, loadDashAudience);
  const box = useBox();
  const saved: P | "all" = isP(settings?.platform) ? settings!.platform : "all";
  const [pick, setPick] = useState<P | "all">(saved);
  useEffect(() => setPick(saved), [saved]);
  const gate = audienceGate(r);
  if (gate || r.state !== "ok") return gate;
  const withViews = r.data.top.filter((t) => t.views !== null);
  // Only platforms that have videos here get a chip.
  const has = PLATFORMS.filter((p) => withViews.some((t) => t.platform === p));
  const shown: P | "all" = pick !== "all" && has.includes(pick) ? pick : "all";
  const items = (shown === "all" ? withViews : withViews.filter((t) => t.platform === shown)).slice(0, 12);
  const chips = has.length > 1 && box.h >= 90;
  const choose = (v: P | "all") => {
    setPick(v);
    onSettings?.({ platform: v });
  };
  if (!withViews.length) return <Note text="Nothing published in the last 28 days yet." href="/analytics?tab=content" link="Content" />;
  const thumbs = box.w >= 260;
  const rowH = thumbs ? 50 : 34;
  const listH = box.h - (chips ? 34 : 0);
  const count = Math.max(1, Math.min(items.length, Math.floor((listH + 6) / rowH)));
  const max = items[0]?.views ?? 1;
  return (
    <div className="h-full flex flex-col min-h-0">
      {chips && (
        <div role="radiogroup" aria-label="Platform" className="flex items-center gap-1 mb-1.5 flex-shrink-0 overflow-x-auto no-scrollbar">
          {(["all", ...has] as const).map((p) => {
            const on = shown === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(p)}
                title={p === "all" ? "Every platform together" : NAME[p]}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 h-7 text-[11.5px] font-semibold whitespace-nowrap transition-colors ${on ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2 hover:text-ink"}`}
              >
                {p === "all" ? "All" : <PlatformIcon platform={p} className="w-4 h-4 rounded-[4px]" />}
                {p !== "all" && box.w >= 420 && NAME[p]}
              </button>
            );
          })}
        </div>
      )}
      {!items.length ? (
        <Note text={`No ${shown === "all" ? "" : `${NAME[shown]} `}videos with views in the last 28 days.`} />
      ) : (
        <ol key={shown} className="flex-1 min-h-0 overflow-hidden -mx-1 motion-stagger">
          {items.slice(0, count).map((v, i) => (
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
