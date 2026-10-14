"use client";

import { useEffect, useState } from "react";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Select } from "@/components/ui/select";
import type { SocialPlatform } from "@/lib/social/providers";
import { BarList, ChartCard, fmtCompact, Legend, LineChart, StatTile } from "../charts";
import { countryName } from "../world-map";
import { AudienceMapView, MAP_MODES, sourcesOf, type MapMode, type MapView } from "../audience-map";
import { Breakdown, byCardHeight } from "../advanced/breakdowns";
import { PLATFORM, type P, sumArr, niceDay, StatusRow, PlatformFilter, AccountNote, SetupCard } from "./shared";
import type { Audience } from "../../lib/queries";
import type { AdvBreakdown } from "../../lib/advanced";
import { runningTotal } from "../../lib/trend-math";

/*
 * Analytics → Audience (1.20.0): who the viewers are, like YouTube Studio's
 * Audience tab. Followers over time (the count, or what changed each day),
 * where they are, and what the platforms share about them: age and gender,
 * subscribed or not, devices, where they watch, Instagram's followers.
 */

const PEOPLE = (p: P) => (p === "youtube" ? "subscribers" : "followers");

export function AudienceTab({
  a,
  breakdowns,
  compare,
  picked,
  setPicked,
}: {
  a: Audience;
  breakdowns: Partial<Record<SocialPlatform, AdvBreakdown[]>>;
  compare: boolean;
  picked: P[];
  setPicked: (v: P[] | null) => void;
}) {
  const ready = a.status.some((s) => s.connected && s.statsReady);
  const [mode, setMode] = useState<"growth" | "net">("growth");
  if (!ready || !a.hasData)
    return (
      <>
        <StatusRow status={a.status} />
        <SetupCard status={a.status} />
      </>
    );
  const pp = a.perPlatform;
  const daily = a.followersDaily ?? {};
  const flow = a.followersFlow ?? {};
  const dayLabels = a.days.map((d) => niceDay(d));
  const hasYT = picked.includes("youtube");
  const followersNow = sumArr(picked.map((p) => (a.followersNow[p] === undefined ? null : a.followersNow[p]!)));
  const net = { value: sumArr(picked.map((p) => pp[p].followersNet)), prev: sumArr(picked.map((p) => pp[p].prevFollowersNet)) };
  const withFlow = picked.filter((p) => flow[p]);
  const gained = withFlow.length ? sumArr(withFlow.map((p) => sumArr(flow[p]!.gained))) : null;
  const lost = withFlow.length ? sumArr(withFlow.map((p) => sumArr(flow[p]!.lost))) : null;
  const watch = hasYT ? { value: sumArr(pp.youtube.watchHours), prev: sumArr(pp.youtube.prevWatchHours) } : null;
  // Each day's change: gained − lost where the platform says, else the change in the count.
  const netPerDay = (p: P): (number | null)[] => {
    const f = flow[p];
    if (f) return a.days.map((_, i) => (f.gained[i] === null && f.lost[i] === null ? null : (f.gained[i] ?? 0) - (f.lost[i] ?? 0)));
    const c = daily[p];
    if (!c) return a.days.map(() => null);
    return c.map((v, i) => (i === 0 || v === null || c[i - 1] === null ? null : v - c[i - 1]!));
  };
  // Growth: one platform's own count when it was copied on most days; otherwise (and for
  // several platforms, whose counts differ too much for one axis) what each gained since the first day.
  const single = picked.length === 1 ? picked[0] : null;
  const counts = single ? daily[single] : undefined;
  const useCounts = mode === "growth" && !!counts && counts.filter((v) => v !== null).length >= Math.max(2, a.days.length / 2);
  const lines = picked
    .map((p) => ({ key: p, label: PLATFORM[p].name, color: PLATFORM[p].color, values: mode === "net" ? netPerDay(p) : useCounts ? counts! : runningTotal(netPerDay(p)) }))
    .filter((s) => s.values.some((v) => v !== null));
  const shownBreakdowns = (["youtube", "instagram"] as const).filter((p) => picked.includes(p) && breakdowns[p]?.length);
  const names = picked.map((p) => PLATFORM[p].name).join(" + ");
  return (
    <div className="space-y-5">
      <PlatformFilter a={a} picked={picked} setPicked={setPicked} />
      <AccountNote status={a.status} className="-mt-3" />

      <div className={`grid gap-3 grid-cols-2 ${withFlow.length ? "lg:grid-cols-5" : "lg:grid-cols-3"}`}>
        <StatTile label={picked.length === 1 ? `${PLATFORM[picked[0]].name} ${PEOPLE(picked[0])}` : "Followers now"} value={followersNow} compare={false} hint={picked.length > 1 ? "all picked platforms" : "latest count"} />
        <StatTile label="New followers (net)" value={net.value} prev={net.prev} compare={compare} />
        {withFlow.length > 0 && <StatTile label="Gained" value={gained} compare={false} hint={withFlow.map((p) => PLATFORM[p].name).join(", ")} />}
        {withFlow.length > 0 && <StatTile label="Lost" value={lost} compare={false} good="down" hint={withFlow.map((p) => PLATFORM[p].name).join(", ")} />}
        <StatTile className={withFlow.length ? "col-span-2 lg:col-span-1" : ""} label="Watch time (YouTube)" value={watch?.value ?? null} prev={watch?.prev ?? null} compare={compare && !!watch} unit=" h" hint={watch ? undefined : "YouTube isn't picked"} />
      </div>

      <ChartCard
        title={mode === "net" ? "New followers per day" : useCounts ? "Followers" : "Followers gained"}
        sub={mode === "net" ? `${names}: gained − lost each day` : useCounts ? `${names}: the count at the end of each day` : `${names}: gained − lost since ${niceDay(a.days[0])}`}
        right={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {lines.length > 1 && <Legend items={lines.map((s) => ({ key: s.key, label: s.label, color: s.color }))} />}
            <div role="radiogroup" aria-label="Show" className="inline-flex rounded-lg border border-line/15 p-0.5">
              {(["growth", "net"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${mode === m ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
                >
                  {m === "growth" ? "Growth" : "Per day"}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {lines.length ? (
          <LineChart
            ariaLabel={mode === "net" ? "New followers per day" : "Followers over time"}
            labels={dayLabels}
            tips={a.days.map((d) => niceDay(d, true))}
            series={lines}
            area={lines.length === 1}
            format={(n) => (n === null ? "–" : !useCounts && n > 0 ? `+${fmtCompact(n)}` : fmtCompact(n))}
          />
        ) : (
          <p className="py-16 text-center text-[13px] text-ink-faint">No follower counts for these days yet: they come with each morning&rsquo;s copy.</p>
        )}
        <div className="mt-3 pt-3 border-t border-line/10 flex flex-wrap gap-x-6 gap-y-2">
          {picked
            .filter((p) => a.followersNow[p] !== undefined)
            .map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                <PlatformIcon platform={p} className="w-4 h-4 rounded" />
                <b className="text-ink tabular-nums">{fmtCompact(a.followersNow[p]!)}</b> {PEOPLE(p)}
              </span>
            ))}
        </div>
      </ChartCard>

      <CountryMap a={a} />

      {shownBreakdowns.map((p) => (
        <section key={p} className="space-y-3">
          <div className="flex items-center gap-2">
            <PlatformIcon platform={p} className="w-6 h-6 rounded-md" />
            <h2 className="font-display text-[19px] font-semibold">{p === "youtube" ? "Who watches on YouTube" : "Who follows and engages on Instagram"}</h2>
          </div>
          {/* An even grid: every card in a row as tall as the row (lists start short, "Show all" opens them). */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {byCardHeight(breakdowns[p]!).map((b) => (
              <div key={b.id} className="min-w-0">
                <Breakdown b={b} compare={compare} />
              </div>
            ))}
          </div>
        </section>
      ))}
      {!shownBreakdowns.length && (
        <p className="text-[12.5px] text-ink-faint max-w-3xl">
          Ages, genders, devices and the rest come from YouTube and Instagram once their numbers are copied (TikTok and Facebook don&rsquo;t share them with apps like ours).
        </p>
      )}
    </div>
  );
}

/**
 * Where the audience is: one platform's countries or all together, on the
 * flat map or the 3D globe (both choices remembered on this device).
 */
function CountryMap({ a }: { a: Audience }) {
  const [mode, setMode] = useState<MapMode>("all");
  const [view, setView] = useState<MapView>("map");
  useEffect(() => {
    try {
      const v = localStorage.getItem("vp-map-view");
      if (v === "map" || v === "globe") setView(v);
      const m = localStorage.getItem("vp-map-mode");
      if (MAP_MODES.some((x) => x.id === m)) setMode(m as MapMode);
    } catch {}
  }, []);
  const remember = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
  const sources = sourcesOf(a);
  const hasData = (id: MapMode) => (id === "all" ? sources.filter((s) => s.id !== "watch" && s.rows.length).length > 0 : (sources.find((s) => s.id === id)?.rows.length ?? 0) > 0);
  const ytReady = a.status.some((s) => s.platform === "youtube" && s.connected && s.statsReady);
  const sub =
    mode === "all"
      ? "Each country's share of your audience, averaged over every platform that shares countries"
      : mode === "views" || mode === "watch"
        ? a.countriesWindow
          ? `${mode === "watch" ? "Hours watched" : "YouTube views"} by country, ${a.countriesWindow[0].toLowerCase()}${a.countriesWindow.slice(1)} (YouTube's own count for it)`
          : `${mode === "watch" ? "Hours watched" : "YouTube views"} by country in this range${a.countriesSince ? ` (since ${niceDay(a.countriesSince)}, when copying started)` : ""}`
        : `${MAP_MODES.find((m) => m.id === mode)!.label} by country (latest copy)`;
  return (
    <ChartCard
      title="Where your audience is"
      sub={sub}
      right={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-[13.5rem] max-w-full">
            <Select
              value={mode}
              onChange={(v) => {
                if (!v) return;
                setMode(v as MapMode);
                remember("vp-map-mode", v);
              }}
              ariaLabel="Map shows"
              className="!h-8 !text-[12.5px]"
              menuMinWidth={240}
              options={MAP_MODES.map((m) => ({
                value: m.id,
                label: m.label,
                hint: hasData(m.id) ? undefined : m.id === "tiktok" ? "Not shared by TikTok" : "No countries yet",
                icon: <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: m.id === "all" ? "rgb(var(--amber))" : sources.find((x) => x.id === m.id)?.color }} aria-hidden />,
              }))}
            />
          </div>
          <div role="radiogroup" aria-label="Show as" className="inline-flex rounded-lg border border-line/15 p-0.5">
            {(["map", "globe"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => {
                  setView(v);
                  remember("vp-map-view", v);
                }}
                className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${view === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {v === "map" ? "Map" : "Globe"}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] items-center">
        <AudienceMapView
          a={a}
          mode={mode}
          view={view}
          youtubeReady={ytReady}
          globeSize={440}
          list={(rows, _format, hover) => (
            <div>
              {rows.length ? (
                <>
                  <BarList
                    items={rows.slice(0, 10).map((c) => ({ key: c.code, label: countryName(c.code), value: c.value, color: mode === "all" ? undefined : sources.find((x) => x.id === mode)?.color }))}
                    format={(n) => (n === null ? "–" : mode === "all" ? `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%` : mode === "watch" ? `${fmtCompact(n)} h` : fmtCompact(n))}
                    onHover={view === "globe" ? hover.set : undefined}
                    active={hover.code}
                  />
                  {rows.length > 10 && <p className="text-[12px] text-ink-faint mt-2">and {rows.length - 10} more countries{mode === "views" ? " (in the CSV)" : ""}.</p>}
                  {view === "globe" && <p className="text-[11.5px] text-ink-faint mt-2">Point at a country to turn the globe to it.</p>}
                </>
              ) : (
                <p className="text-[13px] text-ink-faint">No countries yet.</p>
              )}
            </div>
          )}
        />
      </div>
    </ChartCard>
  );
}
