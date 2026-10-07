"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KindIcon } from "@/components/ui/kind-icon";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { Pipeline, PostToday, UpcomingLong, UpcomingShort } from "../lib/queries";
import { DueChip, localDay } from "./tasks-widget";
import { useBox } from "./widget-box";
import { CountUp } from "@/components/ui/count-up";

const dayLabel = (d: string, today: string) => {
  const t = new Date(`${today}T00:00:00`);
  const x = new Date(`${d}T00:00:00`);
  const diff = Math.round((x.getTime() - t.getTime()) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff > 1 && diff < 7 ? x.toLocaleDateString(undefined, { weekday: "long" }) : x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function EmptyLine({ text }: { text: string }) {
  return <p className="h-full min-h-[48px] flex items-center justify-center text-center text-[12.5px] text-ink-soft">{text}</p>;
}

export function UpcomingShortsWidget({ items }: { items: UpcomingShort[] }) {
  const today = localDay();
  if (!items.length) return <EmptyLine text="No shorts planned ahead." />;
  return (
    <ul className="h-full widget-scroll -mx-1 motion-stagger">
      {items.map((s, i) => {
        const newDay = i === 0 || items[i - 1].date !== s.date;
        return (
          <li key={s.id}>
            <Link href={`/shorts/${s.id}`} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2/70">
              <span className={`w-8 text-center flex-shrink-0 leading-none ${newDay ? "" : "invisible"}`}>
                <span className="block text-[9.5px] font-bold uppercase text-ink-faint">{new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className={`block text-[14px] font-bold tabular-nums ${s.date === today ? "text-amber" : ""}`}>{Number(s.date.slice(8))}</span>
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[12.5px] font-semibold truncate">
                  <span className="font-mono text-ink-faint font-normal">#{s.number}</span> {s.title}
                </span>
                <span className="block text-[11px] text-ink-soft truncate">
                  {dayLabel(s.date, today)} · {s.stage}
                </span>
              </span>
              {s.editor &&
                (s.editor.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.editor.avatarUrl} alt={s.editor.name} title={`Editor: ${s.editor.name}`} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span title={`Editor: ${s.editor.name}`} className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ background: s.editor.color }}>
                    {s.editor.name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function UpcomingLongsWidget({ items }: { items: UpcomingLong[] }) {
  const today = localDay();
  if (!items.length) return <EmptyLine text="No long videos in progress." />;
  return (
    <ul className="h-full widget-scroll -mx-1 motion-stagger">
      {items.map((l) => (
        <li key={l.id}>
          <Link href={`/videos/${l.id}`} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2/70">
            {l.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.thumb} alt="" className="w-[52px] aspect-video rounded-[5px] object-cover flex-shrink-0 bg-surface-2" />
            ) : (
              <span className="w-[52px] aspect-video rounded-[5px] bg-long/10 flex items-center justify-center flex-shrink-0">
                <KindIcon kind="long" className="w-3.5 h-3.5" />
              </span>
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[12.5px] font-semibold truncate">
                <span className="font-mono text-ink-faint font-normal">#{l.number}</span> {l.title}
              </span>
              <span className="block text-[11px] font-semibold text-long truncate">{l.stage}</span>
            </span>
            {l.date ? <DueChip due={l.date} today={today} /> : <span className="text-[10.5px] text-ink-faint flex-shrink-0">No date</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const SHORT_STEPS: [string, string][] = [
  ["script", "Script"],
  ["editing", "Editing"],
  ["review", "Review"],
  ["ready", "Ready"],
];
const LONG_STEPS: [string, string][] = [
  ["ideate", "Ideate"],
  ["research", "Research"],
  ["script", "Script"],
  ["film", "Film"],
  ["edit", "Edit"],
  ["review", "Review"],
  ["package", "Package"],
  ["publish", "Post"],
];

/** How many videos sit at each step: bottlenecks at a glance. */
export function PipelineWidget({ pipeline }: { pipeline: Pipeline }) {
  const box = useBox();
  const groups = [
    { kind: "short" as const, label: "Shorts", steps: SHORT_STEPS, counts: pipeline.shorts, color: "rgb(var(--short))", href: "/shorts", done: pipeline.shorts.posted ?? 0 },
    { kind: "long" as const, label: "Long videos", steps: LONG_STEPS, counts: pipeline.longs, color: "rgb(var(--long))", href: "/videos", done: pipeline.longs.done ?? 0 },
  ];
  return (
    <div className={`grid gap-x-5 gap-y-3 h-full widget-scroll content-start ${box.w >= 380 ? "grid-cols-2" : "grid-cols-1"}`}>
      {groups.map((g) => {
        const max = Math.max(1, ...g.steps.map(([k]) => g.counts[k] ?? 0));
        // Rows grow with the card (same height in both columns so they line up).
        const stacked = box.w < 380;
        const rowH = stacked ? 18 : Math.max(18, Math.min(30, Math.floor((box.h - 28) / 8)));
        const total = g.steps.reduce((n, [k]) => n + (g.counts[k] ?? 0), 0);
        return (
          <div key={g.kind} className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <KindIcon kind={g.kind} className="w-3.5 h-3.5" />
              <Link href={g.href} className="text-[12.5px] font-semibold hover:underline truncate">
                {g.label}
              </Link>
              <span className="text-[11px] text-ink-faint tabular-nums">{total}</span>
              {box.w >= 300 && <span className="ml-auto text-[10.5px] text-ink-faint whitespace-nowrap">{g.done} posted</span>}
            </div>
            <ul>
              {g.steps.map(([k, label], idx) => {
                const n = g.counts[k] ?? 0;
                return (
                  <li key={k} className="grid grid-cols-[3.5rem_1fr_1.25rem] items-center gap-1.5 text-[11.5px] leading-4" style={{ height: rowH }}>
                    <span className={`truncate ${n ? "text-ink-soft" : "text-ink-faint"}`}>{label}</span>
                    <span className="rounded-full bg-line/10 overflow-hidden" style={{ height: rowH >= 26 ? 8 : 6 }}>
                      <span className="bar-grow block h-full rounded-full transition-[width] duration-500" style={{ width: `${(n / max) * 100}%`, background: g.color, opacity: n ? 1 : 0, animationDelay: `${idx * 60 + (g.kind === "long" ? 120 : 0)}ms` }} />
                    </span>
                    <span className={`text-right font-bold tabular-nums ${n ? "" : "text-ink-faint font-normal"}`}>
                      <CountUp value={n} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "text-ink-soft" },
  uploading: { label: "Uploading", cls: "text-amber" },
  publishing: { label: "Posting", cls: "text-amber" },
  published: { label: "Posted", cls: "text-green" },
  failed: { label: "Failed", cls: "text-red" },
};

export function PostingTodayWidget({ posts }: { posts: PostToday[] }) {
  const today = localDay();
  const roomy = useBox().w >= 250;
  const time = (at: string) => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const todays = posts.filter((p) => localDay(new Date(p.at)) === today || p.status === "failed");
  todays.sort((a, b) => (a.status === "failed" ? -1 : 0) - (b.status === "failed" ? -1 : 0) || a.at.localeCompare(b.at));
  if (!todays.length) return <EmptyLine text="Nothing posting today." />;
  return (
    <ul className="h-full widget-scroll -mx-1 motion-stagger">
      {todays.map((p) => {
        const st = STATUS[p.status] ?? { label: p.status, cls: "text-ink-soft" };
        return (
          <li key={p.id}>
            <Link href={`/shorts/${p.shortId}`} className={`flex items-center gap-2 rounded-md px-1 py-[3px] hover:bg-surface-2/70 ${p.status === "failed" ? "bg-red/[0.06]" : ""}`}>
              {roomy && <span className="min-w-[2.25rem] text-[11.5px] font-bold tabular-nums whitespace-nowrap flex-shrink-0">{time(p.at)}</span>}
              <PlatformIcon platform={p.platform as "youtube"} className="w-4 h-4 rounded-[4px] flex-shrink-0" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[12px] truncate">
                  <span className="font-mono text-ink-faint">#{p.number}</span> {p.title}
                </span>
                {!roomy && <span className="block text-[10.5px] font-semibold text-ink-soft tabular-nums">{time(p.at)}</span>}
              </span>
              {roomy ? (
                <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold flex-shrink-0 ${st.cls}`}>
                  {(p.status === "uploading" || p.status === "publishing") && <span className="live-dot w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
                  {st.label}
                </span>
              ) : (
                <span title={st.label} className={`w-2 h-2 rounded-full flex-shrink-0 bg-current ${st.cls} ${p.status === "uploading" || p.status === "publishing" || p.status === "failed" ? "live-dot" : ""}`} />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Weather (Open-Meteo: free, no key)
// ---------------------------------------------------------------------------

type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";
const WMO = (c: number): [Sky, string] =>
  c === 0
    ? ["clear", "Clear"]
    : c <= 2
      ? ["partly", "Partly cloudy"]
      : c === 3
        ? ["cloudy", "Cloudy"]
        : c <= 48
          ? ["fog", "Fog"]
          : c <= 57
            ? ["drizzle", "Drizzle"]
            : c <= 67
              ? ["rain", "Rain"]
              : c <= 77
                ? ["snow", "Snow"]
                : c <= 82
                  ? ["rain", "Showers"]
                  : c <= 86
                    ? ["snow", "Snow showers"]
                    : ["storm", "Thunderstorm"];

/** Small drawn weather icons (no emoji: those look different on every device). */
export function WeatherIcon({ sky, night = false, className = "w-6 h-6", animated = false }: { sky: Sky; night?: boolean; className?: string; animated?: boolean }) {
  const sun = "#f59e0b";
  const cloud = "rgb(var(--ink-soft))";
  const drop = "#3b82f6";
  // Moving parts (only on the big "now" icon): rays turn, clouds drift, rain falls.
  const a = (cls: string, delay = 0) => (animated ? { className: cls, style: { animationDelay: `${delay}ms` } } : {});
  const Cloud = ({ x = 0, y = 0, fill = "rgb(var(--surface-2))" }: { x?: number; y?: number; fill?: string }) => (
    <g {...a("wx-cloud")}>
      <path
        transform={`translate(${x} ${y})`}
        d="M7 18.5h9.5a3.75 3.75 0 0 0 .4-7.48A5.25 5.25 0 0 0 6.9 9.6 4.45 4.45 0 0 0 7 18.5Z"
        fill={fill}
        stroke={cloud}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </g>
  );
  const Sun = ({ cx = 12, cy = 12, r = 4 }: { cx?: number; cy?: number; r?: number }) =>
    night ? (
      <path d={`M${cx + r * 0.9} ${cy + r * 0.55}A${r * 1.15} ${r * 1.15} 0 1 1 ${cx - r * 0.2} ${cy - r * 1.1} ${r * 0.9} ${r * 0.9} 0 0 0 ${cx + r * 0.9} ${cy + r * 0.55}Z`} fill="#a5b4fc" />
    ) : (
      <g stroke={sun} strokeWidth="1.6" strokeLinecap="round">
        <circle cx={cx} cy={cy} r={r} fill={sun} />
        <g className={animated ? "wx-rays" : undefined} style={animated ? { transformBox: "view-box", transformOrigin: `${cx}px ${cy}px` } : undefined}>
          {Array.from({ length: 8 }, (_, i) => {
            const t = (i * Math.PI) / 4;
            const q = (v: number) => Math.round(v * 100) / 100; // same digits on server and browser
            return <line key={i} x1={q(cx + Math.cos(t) * (r + 2))} y1={q(cy + Math.sin(t) * (r + 2))} x2={q(cx + Math.cos(t) * (r + 3.6))} y2={q(cy + Math.sin(t) * (r + 3.6))} />;
          })}
        </g>
      </g>
    );
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {sky === "clear" && <Sun />}
      {sky === "partly" && (
        <>
          <Sun cx={9} cy={9} r={3.4} />
          <Cloud x={1.5} y={1.5} />
        </>
      )}
      {(sky === "cloudy" || sky === "fog") && <Cloud y={-1.5} />}
      {sky === "fog" && <path d="M5 20.5h14M7 23h10" stroke={cloud} strokeWidth="1.5" strokeLinecap="round" />}
      {(sky === "drizzle" || sky === "rain" || sky === "storm" || sky === "snow") && <Cloud y={-3.5} />}
      {sky === "drizzle" &&
        [9, 13, 17].map((x, k) => <path key={x} d={`M${x} 18.5v1.5`} stroke={drop} strokeWidth="1.6" strokeLinecap="round" {...a("wx-drop", k * 300)} />)}
      {sky === "rain" &&
        [8.5, 12.5, 16.5].map((x, k) => <path key={x} d={`M${x} 18 ${x - 1} 21.5`} stroke={drop} strokeWidth="1.6" strokeLinecap="round" {...a("wx-drop", k * 280)} />)}
      {sky === "snow" && (
        <g fill={cloud}>
          {[
            [8.5, 19.5],
            [12.5, 21.5],
            [16.5, 19.5],
          ].map(([x, y], k) => (
            <circle key={x} cx={x} cy={y} r="1.1" {...a("wx-flake", k * 600)} />
          ))}
        </g>
      )}
      {sky === "storm" && <path d="M12.5 16.5 10 20.5h3l-1.5 3.2" fill="none" stroke={sun} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...a("wx-bolt")} />}
    </svg>
  );
}

type Wx = { temp: number; code: number; wind: number; isDay: boolean; days: { date: string; max: number; min: number; code: number }[] };

/** Now (big) and the next days (a strip). Wide = more days. */
export function WeatherWidget({ settings }: { settings?: Record<string, unknown> }) {
  const f = settings?.units === "f";
  const box = useBox();
  const [place, setPlace] = useState<{ name: string; lat: number; lon: number } | null>(
    typeof settings?.lat === "number" ? { name: String(settings.city ?? ""), lat: settings.lat as number, lon: settings.lon as number } : null
  );
  const [wx, setWx] = useState<Wx | null>(null);
  const [failed, setFailed] = useState(false);

  // No city chosen: this device's location if allowed, otherwise Bucharest.
  useEffect(() => {
    if (typeof settings?.lat === "number") return setPlace({ name: String(settings.city ?? ""), lat: settings.lat as number, lon: settings.lon as number });
    const fallback = () => setPlace({ name: "Bucharest", lat: 44.43, lon: 26.1 });
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition((p) => setPlace({ name: "Your location", lat: p.coords.latitude, lon: p.coords.longitude }), fallback, { timeout: 4000, maximumAge: 3_600_000 });
  }, [settings?.lat, settings?.lon, settings?.city]);

  useEffect(() => {
    if (!place) return;
    let alive = true;
    setFailed(false);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=8${f ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setWx({
          temp: Math.round(j.current.temperature_2m),
          code: j.current.weather_code,
          wind: Math.round(j.current.wind_speed_10m),
          isDay: j.current.is_day !== 0,
          days: (j.daily.time as string[]).map((d, i) => ({ date: d, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]), code: j.daily.weather_code[i] })),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [place, f]);

  if (failed) return <EmptyLine text="Couldn't load the weather." />;
  if (!wx) return <div className="skeleton h-full rounded-lg opacity-60" />;
  const [sky, label] = WMO(wx.code);
  const todayWx = wx.days[0];
  // As many days as fit (about 52px each); none when it's very short.
  const next = box.h >= 96 ? wx.days.slice(1, 1 + Math.max(3, Math.min(7, Math.floor(box.w / 52)))) : [];
  return (
    <div className={`h-full flex flex-col justify-center ${box.h >= 170 ? "gap-5" : next.length && box.h < 120 ? "justify-between gap-1.5" : "gap-3"}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <WeatherIcon animated sky={sky} night={!wx.isDay} className={`${box.h >= 170 ? "w-14 h-14" : "w-10 h-10"} flex-shrink-0`} />
        <div className="font-display font-semibold leading-none tabular-nums tracking-tight" style={{ fontSize: Math.max(26, Math.min(42, Math.round(box.h / 4))) }}>
          <CountUp value={wx.temp} />°
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[12.5px] font-semibold truncate">{label}</div>
          <div className="text-[11px] text-ink-soft truncate">
            {place?.name}
            {todayWx && (
              <>
                {" "}
                · <span className="tabular-nums">{todayWx.max}° / {todayWx.min}°</span>
              </>
            )}
          </div>
        </div>
      </div>
      {next.length > 0 && <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${next.length}, minmax(0, 1fr))` }}>
        {next.map((d) => (
          <div key={d.date} className="flex flex-col items-center leading-none py-0.5" title={WMO(d.code)[1]}>
            <span className="text-[10px] font-bold text-ink-faint uppercase">{new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)}</span>
            <WeatherIcon sky={WMO(d.code)[0]} className="w-5 h-5 my-0.5" />
            <span className="text-[11px] tabular-nums">
              <b className="font-semibold">{d.max}°</b> <span className="text-ink-faint">{d.min}°</span>
            </span>
          </div>
        ))}
      </div>}
    </div>
  );
}

/** Weather settings: search a city (Open-Meteo geocoding). */
export function WeatherCitySearch({ onPick }: { onPick: (p: { city: string; lat: number; lon: number }) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ name: string; country: string; admin1?: string; latitude: number; longitude: number }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6`)
        .then((r) => r.json())
        .then((j) => setHits(j.results ?? []))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-1.5">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a city…"
        className="w-full rounded-lg border border-line/15 bg-surface px-3 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber"
      />
      {hits.map((h) => (
        <button
          key={`${h.latitude},${h.longitude}`}
          type="button"
          onClick={() => {
            onPick({ city: h.name, lat: h.latitude, lon: h.longitude });
            setQ("");
            setHits([]);
          }}
          className="w-full text-left rounded-lg px-3 h-10 text-[13.5px] hover:bg-surface-2"
        >
          {h.name} <span className="text-ink-faint">{[h.admin1, h.country].filter(Boolean).join(", ")}</span>
        </button>
      ))}
    </div>
  );
}
