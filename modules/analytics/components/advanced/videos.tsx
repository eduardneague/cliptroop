"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { AdvVideo } from "../../lib/advanced";
import type { SocialPlatform } from "@/lib/social/providers";
import { ScoreBadge } from "../content-list";
import { compactNum, money, niceDay, pctOf, seconds } from "./format";
import { MiniCurve } from "./retention-chart";
import { isWide, KIND_LABEL } from "../../lib/kinds";

type Col = { key: string; label: string; title?: string; get: (v: AdvVideo) => number | null; show: (v: AdvVideo) => string; badge?: boolean };

const int = (n: number | null) => compactNum(n);
const per = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : (a / b) * 100);

function columns(platform: SocialPlatform, currency: string, withMoney: boolean): Col[] {
  const c = (key: string, label: string, get: Col["get"], show?: Col["show"], title?: string): Col => ({ key, label, get, show: show ?? ((v) => int(get(v))), title });
  if (platform === "youtube")
    return [
      c("views", "Views", (v) => v.views),
      SCORE,
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
      SCORE,
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
      SCORE,
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
    SCORE,
    c("likes", "Likes", (v) => v.likes),
    c("comments", "Comments", (v) => v.comments),
    c("shares", "Shares", (v) => v.shares),
    c("rate", "Engaged", (v) => per((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0), v.views), (v) => fmtRate(per((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0), v.views)), "Likes, comments and shares per 100 views"),
  ];
}
/** "× typical": a badge, sorted by the number behind it. */
const SCORE: Col = { key: "score", label: "× typical", title: "Views next to your typical video of the same kind (the median of the ones posted before it)", get: (v) => v.score, show: () => "", badge: true };
const fmtRate = (x: number | null) => (x === null ? "–" : `${x < 10 ? x.toFixed(1) : Math.round(x)}%`);
/** The hook's hold: still watching after 3 s (Shorts) or 30 s (long videos). */
const holdOf = (v: AdvVideo) => (isWide(v.kind) ? v.retention?.at30s : v.retention?.at3s) ?? null;

const KIND = KIND_LABEL;

export function VideoTable({ teamId, platform, videos, currency, withMoney }: { teamId: string; platform: SocialPlatform; videos: AdvVideo[]; currency: string; withMoney: boolean }) {
  const cols = useMemo(() => columns(platform, currency, withMoney), [platform, currency, withMoney]);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [q, setQ] = useState("");
  const [ours, setOurs] = useState(false);
  const [all, setAll] = useState(false);
  const router = useRouter();
  const href = (v: AdvVideo) => `/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=advanced`;
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
          {list.length} {list.length === 1 ? "video" : "videos"} · click one for its analytics
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
                <tr key={v.id} className="group border-t border-line/10 hover:bg-surface-2/40 cursor-pointer" onClick={() => router.push(href(v))}>
                  <td className="sticky left-0 z-[1] bg-surface group-hover:bg-surface-2 px-3 py-2 max-w-[13rem] sm:max-w-[17rem] shadow-[1px_0_0_rgb(var(--line)/0.1)]">
                    <Link href={href(v)} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 min-w-0 text-left w-full">
                      <Thumb v={v} className="w-14 h-9" />
                      <span className="min-w-0">
                        <span className="block font-semibold truncate">{v.title || "Untitled"}</span>
                        <span className="block text-[11px] text-ink-faint truncate">
                          {KIND[v.kind]}
                          {v.durationSec ? ` · ${seconds(v.durationSec)}` : ""}
                          {v.ours ? ` · #${v.ours.number ?? "?"}` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-ink-soft whitespace-nowrap">{v.publishedAt ? niceDay(v.publishedAt) : "–"}</td>
                  {cols.map((c) => (
                    <td key={c.key} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${c.key === "views" ? "font-semibold" : "text-ink-soft"}`}>
                      {c.badge ? <ScoreBadge score={c.get(v)} /> : c.show(v)}
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
