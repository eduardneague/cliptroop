"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KindIcon } from "@/components/ui/kind-icon";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { Pipeline, PostToday, UpcomingLong, UpcomingShort } from "../lib/queries";
import { DueChip, localDay } from "./tasks-widget";

const dayLabel = (d: string, today: string) => {
  const t = new Date(`${today}T00:00:00`);
  const x = new Date(`${d}T00:00:00`);
  const diff = Math.round((x.getTime() - t.getTime()) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff < 7 ? x.toLocaleDateString(undefined, { weekday: "long" }) : x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function UpcomingShortsWidget({ items }: { items: UpcomingShort[] }) {
  const today = localDay();
  if (!items.length) return <p className="py-8 text-center text-[13.5px] text-ink-soft">No shorts planned ahead.</p>;
  return (
    <ul className="space-y-0.5 max-h-[380px] overflow-y-auto -mr-2 pr-2">
      {items.map((s) => (
        <li key={s.id}>
          <Link href={`/shorts/${s.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-1 hover:bg-surface-2/70">
            <span className="w-11 text-center flex-shrink-0">
              <span className="block text-[10.5px] font-bold uppercase text-ink-faint">{new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className={`block text-[17px] font-bold tabular-nums leading-tight ${s.date === today ? "text-amber" : ""}`}>{Number(s.date.slice(8))}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold truncate">
                <span className="font-mono text-ink-faint font-normal">#{s.number}</span> {s.title}
              </span>
              <span className="block text-[12px] text-ink-soft">
                {dayLabel(s.date, today)} · {s.stage}
              </span>
            </span>
            {s.editor &&
              (s.editor.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.editor.avatarUrl} alt={s.editor.name} title={`Editor: ${s.editor.name}`} className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <span title={`Editor: ${s.editor.name}`} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: s.editor.color }}>
                  {s.editor.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function UpcomingLongsWidget({ items }: { items: UpcomingLong[] }) {
  const today = localDay();
  if (!items.length) return <p className="py-8 text-center text-[13.5px] text-ink-soft">No long videos in progress.</p>;
  return (
    <ul className="space-y-1 max-h-[380px] overflow-y-auto -mr-2 pr-2">
      {items.map((l) => (
        <li key={l.id}>
          <Link href={`/videos/${l.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-1 hover:bg-surface-2/70">
            {l.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.thumb} alt="" className="w-20 aspect-video rounded-md object-cover flex-shrink-0" />
            ) : (
              <span className="w-20 aspect-video rounded-md bg-surface-2 flex items-center justify-center flex-shrink-0">
                <KindIcon kind="long" className="w-4 h-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold truncate">
                <span className="font-mono text-ink-faint font-normal">#{l.number}</span> {l.title}
              </span>
              <span className="mt-1 inline-flex items-center rounded-md bg-long/12 text-long px-1.5 h-5 text-[11px] font-bold">{l.stage}</span>
            </span>
            {l.date ? <DueChip due={l.date} today={today} /> : <span className="text-[11.5px] text-ink-faint">No date</span>}
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
  ["ready", "Ready to post"],
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
  const groups = [
    { kind: "short" as const, label: "Shorts", steps: SHORT_STEPS, counts: pipeline.shorts, color: "rgb(var(--short))", href: "/shorts", done: pipeline.shorts.posted ?? 0 },
    { kind: "long" as const, label: "Long videos", steps: LONG_STEPS, counts: pipeline.longs, color: "rgb(var(--long))", href: "/videos", done: pipeline.longs.done ?? 0 },
  ];
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {groups.map((g) => {
        const max = Math.max(1, ...g.steps.map(([k]) => g.counts[k] ?? 0));
        return (
          <div key={g.kind}>
            <div className="flex items-center gap-2 mb-2.5">
              <KindIcon kind={g.kind} className="w-4 h-4" />
              <Link href={g.href} className="text-[13.5px] font-semibold hover:underline">
                {g.label}
              </Link>
              <span className="ml-auto text-[11.5px] text-ink-faint">{g.done} posted</span>
            </div>
            <ul className="space-y-1.5">
              {g.steps.map(([k, label]) => {
                const n = g.counts[k] ?? 0;
                return (
                  <li key={k} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-[12.5px]">
                    <span className="text-ink-soft truncate">{label}</span>
                    <span className="h-2.5 rounded-[3px] bg-line/10 overflow-hidden">
                      <span className="block h-full rounded-[3px] transition-[width] duration-500" style={{ width: `${(n / max) * 100}%`, background: g.color, opacity: n ? 1 : 0 }} />
                    </span>
                    <span className="text-right font-bold tabular-nums">{n}</span>
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
  scheduled: { label: "Scheduled", cls: "bg-surface-2 text-ink-soft" },
  uploading: { label: "Uploading", cls: "bg-amber/12 text-amber" },
  publishing: { label: "Posting", cls: "bg-amber/12 text-amber" },
  published: { label: "Posted", cls: "bg-green/12 text-green" },
  failed: { label: "Failed", cls: "bg-red/12 text-red" },
};

export function PostingTodayWidget({ posts }: { posts: PostToday[] }) {
  const today = localDay();
  const todays = posts.filter((p) => localDay(new Date(p.at)) === today || p.status === "failed");
  todays.sort((a, b) => (a.status === "failed" ? -1 : 0) - (b.status === "failed" ? -1 : 0) || a.at.localeCompare(b.at));
  if (!todays.length) return <p className="py-8 text-center text-[13.5px] text-ink-soft">Nothing scheduled to post today.</p>;
  return (
    <ul className="space-y-1 max-h-[380px] overflow-y-auto -mr-2 pr-2">
      {todays.map((p) => {
        const st = STATUS[p.status] ?? { label: p.status, cls: "bg-surface-2 text-ink-soft" };
        return (
          <li key={p.id}>
            <Link href={`/shorts/${p.shortId}`} className={`flex items-center gap-3 rounded-xl px-2 py-2 -mx-1 hover:bg-surface-2/70 ${p.status === "failed" ? "bg-red/[0.05]" : ""}`}>
              <span className="w-12 text-[13px] font-bold tabular-nums">{new Date(p.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
              <PlatformIcon platform={p.platform as "youtube"} className="w-7 h-7 rounded-md flex-shrink-0" />
              <span className="min-w-0 flex-1 text-[13px] truncate">
                <span className="font-mono text-ink-faint">#{p.number}</span> {p.title}
              </span>
              <span className={`rounded-md px-1.5 h-5 inline-flex items-center text-[11px] font-bold ${st.cls}`}>{st.label}</span>
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

const WMO = (c: number): [string, string] =>
  c === 0
    ? ["☀️", "Clear"]
    : c <= 2
      ? ["⛅", "Partly cloudy"]
      : c === 3
        ? ["☁️", "Cloudy"]
        : c <= 48
          ? ["🌫️", "Fog"]
          : c <= 57
            ? ["🌦️", "Drizzle"]
            : c <= 67
              ? ["🌧️", "Rain"]
              : c <= 77
                ? ["🌨️", "Snow"]
                : c <= 82
                  ? ["🌦️", "Showers"]
                  : c <= 86
                    ? ["🌨️", "Snow showers"]
                    : ["⛈️", "Thunderstorm"];

type Wx = { temp: number; code: number; wind: number; days: { date: string; max: number; min: number; code: number }[] };

export function WeatherWidget({ settings }: { settings?: Record<string, unknown> }) {
  const f = settings?.units === "f";
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=6${f ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setWx({
          temp: Math.round(j.current.temperature_2m),
          code: j.current.weather_code,
          wind: Math.round(j.current.wind_speed_10m),
          days: (j.daily.time as string[]).map((d, i) => ({ date: d, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]), code: j.daily.weather_code[i] })),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [place, f]);

  if (failed) return <p className="py-8 text-center text-[13.5px] text-ink-soft">Couldn&rsquo;t load the weather.</p>;
  if (!wx) return <div className="h-[150px] rounded-xl bg-surface-2/40 animate-pulse" />;
  const [icon, label] = WMO(wx.code);
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-[46px] leading-none" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="font-display text-[40px] font-semibold leading-none tabular-nums">
            {wx.temp}°{f ? "F" : "C"}
          </div>
          <div className="text-[13px] text-ink-soft mt-1 truncate">
            {label} · {place?.name} · wind {wx.wind} {f ? "mph" : "km/h"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1 mt-4">
        {wx.days.slice(1, 6).map((d) => (
          <div key={d.date} className="rounded-lg bg-surface-2/50 py-2 text-center">
            <div className="text-[11px] font-bold text-ink-soft">{new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</div>
            <div className="text-[18px] leading-tight my-0.5">{WMO(d.code)[0]}</div>
            <div className="text-[11.5px] tabular-nums">
              <b>{d.max}°</b> <span className="text-ink-faint">{d.min}°</span>
            </div>
          </div>
        ))}
      </div>
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
