"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { ExternalIcon, SearchIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { loadVideoSplits } from "@/app/(dashboard)/analytics/actions";
import type { AdvVideo } from "../../lib/advanced";
import type { SocialPlatform } from "@/lib/social/providers";
import { compactNum, money, niceDay, pctOf, seconds } from "./format";
import { MiniCurve, RetentionChart } from "./retention-chart";

type Col = { key: string; label: string; title?: string; get: (v: AdvVideo) => number | null; show: (v: AdvVideo) => string };

const int = (n: number | null) => compactNum(n);
const per = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : (a / b) * 100);

function columns(platform: SocialPlatform, currency: string, withMoney: boolean): Col[] {
  const c = (key: string, label: string, get: Col["get"], show?: Col["show"], title?: string): Col => ({ key, label, get, show: show ?? ((v) => int(get(v))), title });
  if (platform === "youtube")
    return [
      c("views", "Views", (v) => v.views),
      c("engaged", "Engaged", (v) => v.engagedViews, undefined, "Engaged views"),
      c("watch", "Watch time", (v) => (v.watchMinutes === null ? null : v.watchMinutes / 60), (v) => (v.watchMinutes === null ? "–" : `${compactNum(v.watchMinutes / 60)} h`)),
      c("avgdur", "Avg view", (v) => v.avgViewSeconds, (v) => seconds(v.avgViewSeconds), "Average view duration"),
      c("avgpct", "Avg %", (v) => v.avgViewPct, (v) => (v.avgViewPct === null ? "–" : `${Math.round(v.avgViewPct)}%`), "Average % viewed"),
      c("hold", "Hook hold", holdOf, (v) => pctOf(holdOf(v)), "Still watching after the first 3 seconds (Shorts) or 30 seconds (long videos)"),
      c("likes", "Likes", (v) => v.likes),
      c("comments", "Comments", (v) => v.comments),
      c("shares", "Shares", (v) => v.shares),
      c("subs", "Subs", (v) => v.subscribersGained, undefined, "Subscribers gained"),
      ...(withMoney
        ? [
            c("revenue", "Revenue", (v) => v.revenue?.revenue ?? null, (v) => money(v.revenue?.revenue ?? null, currency)),
            c("rpm", "RPM", (v) => v.revenue?.rpm ?? null, (v) => money(v.revenue?.rpm ?? null, currency, true), "Revenue per 1,000 views"),
          ]
        : []),
    ];
  if (platform === "instagram")
    return [
      c("views", "Views", (v) => v.views),
      c("reach", "Reach", (v) => v.reach),
      c("avgdur", "Avg watch", (v) => v.avgViewSeconds, (v) => seconds(v.avgViewSeconds), "Average watch time (Reels)"),
      c("skip", "Skipped", (v) => v.skipRate, (v) => (v.skipRate === null ? "–" : `${Math.round(v.skipRate)}%`), "Swiped away in the first 3 seconds"),
      c("likes", "Likes", (v) => v.likes),
      c("comments", "Comments", (v) => v.comments),
      c("shares", "Shares", (v) => v.shares),
      c("saves", "Saves", (v) => v.saves),
      c("reposts", "Reposts", (v) => v.reposts),
      c("rate", "Engaged", (v) => per((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0) + (v.saves ?? 0), v.views), (v) => fmtRate(per((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0) + (v.saves ?? 0), v.views)), "Likes, comments, shares and saves per 100 views"),
    ];
  if (platform === "facebook")
    return [
      c("views", "Plays", (v) => v.views),
      c("reach", "Reach", (v) => v.metrics.reach ?? v.reach),
      c("avgdur", "Avg watch", (v) => v.avgViewSeconds, (v) => seconds(v.avgViewSeconds)),
      c("replays", "Replays", (v) => v.metrics.replays ?? null),
      c("likes", "Reactions", (v) => v.likes),
      c("comments", "Comments", (v) => v.comments),
      c("shares", "Shares", (v) => v.shares),
      c("follows", "Follows", (v) => v.metrics.followers_gained ?? null, undefined, "Followers gained from it"),
    ];
  return [
    c("length", "Length", (v) => v.durationSec, (v) => seconds(v.durationSec)),
    c("views", "Views", (v) => v.views),
    c("likes", "Likes", (v) => v.likes),
    c("comments", "Comments", (v) => v.comments),
    c("shares", "Shares", (v) => v.shares),
    c("rate", "Engaged", (v) => per((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0), v.views), (v) => fmtRate(per((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0), v.views)), "Likes, comments and shares per 100 views"),
  ];
}
const fmtRate = (x: number | null) => (x === null ? "–" : `${x < 10 ? x.toFixed(1) : Math.round(x)}%`);
/** The hook's hold: still watching after 3 s (Shorts) or 30 s (long videos). */
const holdOf = (v: AdvVideo) => (v.kind === "long" ? v.retention?.at30s : v.retention?.at3s) ?? null;

const KIND = { short: "Short", long: "Long video", post: "Post" } as const;
const TYPE_NAME: Record<string, string> = { filler: "Everyday short", sponsorship: "Sponsored short", big: "Big short" };

export function VideoTable({ teamId, platform, videos, currency, withMoney }: { teamId: string; platform: SocialPlatform; videos: AdvVideo[]; currency: string; withMoney: boolean }) {
  const cols = useMemo(() => columns(platform, currency, withMoney), [platform, currency, withMoney]);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [q, setQ] = useState("");
  const [ours, setOurs] = useState(false);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<AdvVideo | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const col = cols.find((c) => c.key === sort.key);
    return videos
      .filter((v) => (!ours || v.ours) && (!needle || (v.title ?? "").toLowerCase().includes(needle) || (v.hook ?? "").toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (!col) return sort.dir * ((a.publishedAt ?? "") < (b.publishedAt ?? "") ? -1 : (a.publishedAt ?? "") > (b.publishedAt ?? "") ? 1 : 0);
        const x = col.get(a);
        const y = col.get(b);
        // Unknown numbers last, whichever way.
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return sort.dir * (x - y);
      });
  }, [videos, q, ours, sort, cols]);
  const shown = all ? list : list.slice(0, 25);
  const head = (key: string, label: string, title?: string, right = true) => {
    const on = sort.key === key;
    return (
      <th key={key} className={`px-2 py-2 font-bold whitespace-nowrap ${right ? "text-right" : "text-left"}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button type="button" title={title} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${on ? "text-ink" : ""}`}>
          {label}
          <span aria-hidden className={`text-[9px] ${on ? "" : "opacity-0"}`}>{sort.dir === 1 ? "▲" : "▼"}</span>
        </button>
      </th>
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2 h-9 rounded-lg border border-line/15 bg-surface px-2.5 w-full sm:w-72 focus-within:ring-2 focus-within:ring-amber/40">
          <SearchIcon className="w-4 h-4 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and hooks" aria-label="Search videos" className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" />
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={ours}
          onClick={() => setOurs((o) => !o)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-[12.5px] font-semibold transition-colors ${ours ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
        >
          <span className={`w-7 h-4 rounded-[5px] relative transition-colors ${ours ? "bg-amber" : "bg-line/20"}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-[3px] bg-white transition-all ${ours ? "left-3.5" : "left-0.5"}`} />
          </span>
          Only ClipTroop&rsquo;s
        </button>
        <span className="text-[12px] text-ink-faint ml-auto">
          {list.length} {list.length === 1 ? "video" : "videos"} · click one for everything about it
        </span>
      </div>
      {list.length ? (
        <div className="rounded-2xl border border-line/10 bg-surface overflow-x-auto styled-scroll">
          <table className="w-full min-w-[900px] text-[12px]">
            <thead>
              <tr className="bg-surface-2 text-[10.5px] text-ink-faint">
                <th className="sticky left-0 z-[1] bg-surface-2 px-3 py-2 text-left font-bold uppercase tracking-wide shadow-[1px_0_0_rgb(var(--line)/0.1)]">Video</th>
                {head("date", "Posted", "When it was published", false)}
                {cols.map((c) => head(c.key, c.label, c.title))}
                {platform === "youtube" || platform === "facebook" ? <th className="px-2 py-2 text-left font-bold uppercase tracking-wide whitespace-nowrap">Retention</th> : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.id} className="group border-t border-line/10 hover:bg-surface-2/40 cursor-pointer" onClick={() => setOpen(v)}>
                  <td className="sticky left-0 z-[1] bg-surface group-hover:bg-surface-2 px-3 py-2 max-w-[13rem] sm:max-w-[17rem] shadow-[1px_0_0_rgb(var(--line)/0.1)]">
                    <button type="button" onClick={() => setOpen(v)} className="flex items-center gap-2.5 min-w-0 text-left w-full">
                      <Thumb v={v} className="w-14 h-9" />
                      <span className="min-w-0">
                        <span className="block font-semibold truncate">{v.title || "Untitled"}</span>
                        <span className="block text-[11px] text-ink-faint truncate">
                          {KIND[v.kind]}
                          {v.durationSec ? ` · ${seconds(v.durationSec)}` : ""}
                          {v.ours ? ` · #${v.ours.number ?? "?"}` : ""}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-2 py-2 text-ink-soft whitespace-nowrap">{v.publishedAt ? niceDay(v.publishedAt) : "–"}</td>
                  {cols.map((c) => (
                    <td key={c.key} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${c.key === "views" ? "font-semibold" : "text-ink-soft"}`}>
                      {c.show(v)}
                    </td>
                  ))}
                  {platform === "youtube" || platform === "facebook" ? <td className="px-2 py-2">{v.curve ? <MiniCurve values={v.curve} color={v.kind === "short" ? "rgb(var(--chart-short))" : "rgb(var(--chart-long))"} /> : <span className="text-ink-faint">–</span>}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line/20 py-10 px-6 text-center text-[13.5px] text-ink-soft">{q || ours ? "No videos match." : "No videos from this platform yet."}</p>
      )}
      {list.length > 25 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink">
          {all ? "Show the first 25" : `Show all ${list.length}`}
        </button>
      )}
      <VideoDrawer teamId={teamId} v={open} onClose={() => setOpen(null)} currency={currency} />
    </div>
  );
}

function Thumb({ v, className }: { v: AdvVideo; className: string }) {
  return (
    <span className={`relative rounded-md overflow-hidden bg-surface-2 flex-shrink-0 ${className}`}>
      {v.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
      )}
      <PlatformIcon platform={v.platform} className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded" />
    </span>
  );
}

/** Names for the extra numbers a platform shares about a video. */
const EXTRA: Record<string, string> = {
  dislikes: "Dislikes",
  subscribers_lost: "Subscribers lost",
  playlist_adds: "Added to playlists",
  playlist_removes: "Removed from playlists",
  premium_views: "YouTube Premium views",
  premium_watch_minutes: "Premium watch minutes",
  card_impressions: "Card impressions",
  card_clicks: "Card clicks",
  card_teaser_impressions: "Card teaser impressions",
  card_teaser_clicks: "Card teaser clicks",
  total_watch_seconds: "Total watch time (s)",
  interactions: "Interactions",
  crossposted_views: "Views from cross-posts",
  facebook_views: "Views on Facebook",
  total_plays: "Plays with replays",
  replays: "Replays",
  reach: "Reach",
  followers_gained: "Followers gained",
};

function VideoDrawer({ teamId, v, onClose, currency }: { teamId: string; v: AdvVideo | null; onClose: () => void; currency: string }) {
  const [splits, setSplits] = useState<Awaited<ReturnType<typeof loadVideoSplits>> | null>(null);
  useEffect(() => {
    setSplits(null);
    if (!v || v.platform !== "youtube") return;
    let live = true;
    loadVideoSplits(teamId, v.platform, v.id).then((r) => live && setSplits(r));
    return () => {
      live = false;
    };
  }, [teamId, v]);
  const nums: [string, string][] = [];
  if (v) {
    const add = (label: string, val: string | null) => {
      if (val && val !== "–") nums.push([label, val]);
    };
    add("Views", compactNum(v.views));
    add("Engaged views", compactNum(v.engagedViews));
    add("Reach", compactNum(v.reach));
    add("Watch time", v.watchMinutes === null ? null : `${compactNum(v.watchMinutes / 60)} h`);
    add("Average view", seconds(v.avgViewSeconds));
    add("Average % viewed", v.avgViewPct === null ? null : `${Math.round(v.avgViewPct)}%`);
    add("Skipped in the first 3 s", v.skipRate === null ? null : `${Math.round(v.skipRate)}%`);
    add("Likes", compactNum(v.likes));
    add("Comments", compactNum(v.comments));
    add("Shares", compactNum(v.shares));
    add("Saves", compactNum(v.saves));
    add("Reposts", compactNum(v.reposts));
    add("Subscribers gained", compactNum(v.subscribersGained));
    for (const [k, val] of Object.entries(v.metrics)) {
      if (k.startsWith("reactions_")) add(`Reactions: ${k.slice(10)}`, compactNum(val));
      else if (EXTRA[k]) add(EXTRA[k], k === "total_watch_seconds" ? seconds(val) : compactNum(val));
    }
    if (v.revenue) {
      add("Revenue", money(v.revenue.revenue, currency));
      add("RPM", money(v.revenue.rpm, currency, true));
      add("CPM", money(v.revenue.cpm, currency, true));
      add("Playback-based CPM", money(v.revenue.playbackCpm, currency, true));
      add("Ad impressions", compactNum(v.revenue.adImpressions));
      add("Monetized playbacks", compactNum(v.revenue.monetizedPlaybacks));
    }
  }
  const r = v?.retention;
  return (
    <Dialog open={!!v} onClose={onClose} title={v?.title || "Untitled"} description={v ? `${KIND[v.kind]}${v.publishedAt ? ` · posted ${niceDay(v.publishedAt, true)}` : ""}${v.durationSec ? ` · ${seconds(v.durationSec)} long` : ""}` : undefined} width="sm:max-w-2xl">
      {v && (
        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <Thumb v={v} className={v.kind === "long" ? "w-40 h-[90px]" : "w-24 h-[136px]"} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {v.url && (
                  <a href={v.url} target="_blank" rel="noopener noreferrer" data-autofocus className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2.5 h-8 text-[12.5px] font-semibold hover:border-line/30">
                    Open <ExternalIcon className="w-3.5 h-3.5" />
                  </a>
                )}
                {v.ours && (
                  <Link href={v.ours.kind === "short" ? `/shorts/${v.ours.id}` : `/videos/${v.ours.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2.5 h-8 text-[12.5px] font-semibold text-amber hover:border-line/30">
                    #{v.ours.number ?? "?"} in ClipTroop
                  </Link>
                )}
                {v.ours?.type && <span className="text-[12px] text-ink-faint">{TYPE_NAME[v.ours.type] ?? v.ours.type}</span>}
              </div>
              {v.hook && (
                <blockquote className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-soft">
                  <span className="block text-[10.5px] font-bold uppercase tracking-wide text-ink-faint mb-0.5">Hook (from the script)</span>
                  {v.hook}
                </blockquote>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
            {nums.map(([label, val]) => (
              <div key={label} className="min-w-0">
                <div className="text-[11.5px] text-ink-faint truncate">{label}</div>
                <div className="text-[15px] font-semibold tabular-nums">{val}</div>
              </div>
            ))}
          </div>

          {v.curve && r && (
            <div>
              <h3 className="text-[13px] font-semibold mb-1">Retention</h3>
              <p className="text-[12px] text-ink-faint mb-2">
                {[
                  v.kind === "long" ? (r.at30s !== null ? `${pctOf(r.at30s)} still watching after 30 s` : null) : r.at3s !== null ? `${pctOf(r.at3s)} still watching after 3 s` : null,
                  r.at50 !== null ? `${pctOf(r.at50)} halfway` : null,
                  r.end !== null ? `${pctOf(r.end)} at the end` : null,
                  r.relative !== null ? `${Math.round(r.relative * 100)} vs similar videos (50 is typical)` : null,
                  r.biggestDrop ? `steepest drop around ${Math.round(r.biggestDrop.at * 100)}%` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <RetentionChart series={[{ key: "v", label: "This video", color: v.kind === "short" ? "rgb(var(--chart-short))" : "rgb(var(--chart-long))", values: v.curve }]} height={200} ariaLabel="Retention of this video" duration={v.durationSec} />
            </div>
          )}

          {v.platform === "youtube" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SplitList title="Where its views came from" rows={splits?.traffic ?? null} />
              <SplitList title="What people searched to find it" rows={splits?.searches ?? null} />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function SplitList({ title, rows }: { title: string; rows: { key: string; label: string; views: number | null }[] | null }) {
  const total = (rows ?? []).reduce((t, r) => t + (r.views ?? 0), 0);
  return (
    <div className="min-w-0">
      <h3 className="text-[13px] font-semibold mb-2">{title}</h3>
      {rows === null ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-3.5 rounded" style={{ width: `${80 - i * 18}%` }} />
          ))}
        </div>
      ) : rows.length ? (
        <ul className="space-y-1.5">
          {rows.slice(0, 8).map((r) => (
            <li key={r.key} className="flex items-baseline gap-2 text-[12.5px]">
              <span className="flex-1 min-w-0 truncate" title={r.label}>
                {r.label}
              </span>
              <span className="font-semibold tabular-nums">{compactNum(r.views)}</span>
              <span className="w-9 text-right text-[11.5px] text-ink-faint tabular-nums">{total ? `${Math.round(((r.views ?? 0) / total) * 100)}%` : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-faint">Not copied yet: a few videos get these each morning.</p>
      )}
    </div>
  );
}
