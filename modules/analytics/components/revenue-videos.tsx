"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { ChevronLeftIcon, ChevronRightIcon, ExternalIcon } from "@/components/ui/icons";
import { loadRevenueVideos } from "@/app/(dashboard)/analytics/actions";
import type { RevenueVideos } from "../lib/queries";
import { fmtCompact, MarkIcon } from "./charts";
import { KIND_LABEL } from "../lib/kinds";

/*
 * A day (or week, or month) of Revenue's chart, opened by clicking it
 * (1.21.0): the videos that made YouTube's money then, biggest first, each
 * with its share and its revenue per 1,000 views; the other income added
 * for those days; ← → to the stretch before or after. Asked from YouTube
 * when opened (money isn't kept per video and day).
 */

export type RevenueStretch = { from: string; to: string; youtube: number; facebook: number; other: number };
export type IncomeLine = { id: string; day: string; source: string; amount: number; note: string | null };

const fmtDay = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
function stretchName(s: { from: string; to: string }) {
  if (s.from === s.to) return fmtDay(s.from, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const [y, m] = s.from.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (s.from.endsWith("-01") && s.to === monthEnd) return fmtDay(s.from, { month: "long", year: "numeric" });
  return `${fmtDay(s.from, { month: "short", day: "numeric" })} – ${fmtDay(s.to, { month: "short", day: "numeric", year: "numeric" })}`;
}
const short = (s: { from: string; to: string }) => (s.from === s.to ? fmtDay(s.from, { month: "short", day: "numeric" }) : `${fmtDay(s.from, { month: "short", day: "numeric" })}–${fmtDay(s.to, { day: "numeric" })}`);

type Loaded = { data: RevenueVideos } | { error: string };

export function RevenueVideosDialog({
  teamId,
  stretches,
  index,
  money,
  entries,
  sourceLabel,
  onClose,
}: {
  teamId: string;
  stretches: RevenueStretch[];
  index: number;
  money: (n: number) => string;
  entries: IncomeLine[];
  sourceLabel: (s: string) => string;
  onClose: () => void;
}) {
  const [at, setAt] = useState(index);
  useEffect(() => setAt(index), [index]);
  const st = stretches[at] ?? null;
  const cache = useRef(new Map<string, Loaded>());
  const [loaded, setLoaded] = useState<{ key: string; res: Loaded } | null>(null);
  const key = st ? `${st.from}:${st.to}` : "";

  useEffect(() => {
    if (!st) return;
    const k = `${st.from}:${st.to}`;
    const hit = cache.current.get(k);
    if (hit) return setLoaded({ key: k, res: hit });
    // No YouTube money then: nothing to ask YouTube about.
    if (!(st.youtube > 0)) return setLoaded({ key: k, res: { data: { from: st.from, to: st.to, currency: "", videos: [], note: "YouTube made no money then (or hasn't reported it yet: its revenue comes a day or two late)." } } });
    let alive = true;
    loadRevenueVideos(teamId, st.from, st.to)
      .then((r) => {
        const res: Loaded = r.error !== undefined ? { error: r.error } : { data: r.data };
        if (!("error" in res)) cache.current.set(k, res);
        if (alive) setLoaded({ key: k, res });
      })
      .catch(() => alive && setLoaded({ key: k, res: { error: "Couldn't load it. Check your connection and try again." } }));
    return () => {
      alive = false;
    };
  }, [st, teamId]);

  const step = useCallback((d: number) => setAt((i) => Math.max(0, Math.min(stretches.length - 1, i + d))), [stretches.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  if (!st) return null;
  const res = loaded && loaded.key === key ? loaded.res : null;
  const data = res && "data" in res ? res.data : null;
  const listed = (data?.videos ?? []).reduce((t, v) => t + v.revenue, 0);
  const top = Math.max(0, ...(data?.videos ?? []).map((v) => v.revenue));
  const income = entries.filter((e) => e.day >= st.from && e.day <= st.to);
  const all = st.youtube + st.facebook + st.other;

  return (
    <Dialog open onClose={onClose} title={`Revenue · ${stretchName(st)}`} description="The videos that made YouTube's money then, biggest first, and any other income added for those days." width="sm:max-w-3xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => step(-1)} disabled={at <= 0} aria-label="The stretch before" className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-[12.5px] font-semibold tabular-nums min-w-[5.5rem] text-center">{short(st)}</span>
          <button type="button" onClick={() => step(1)} disabled={at >= stretches.length - 1} aria-label="The stretch after" className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
          <span className="flex-1" />
          <span className="text-[12.5px] text-ink-soft text-right">
            <b className="font-display text-[20px] text-ink tabular-nums">{money(all)}</b> in all
            {(st.facebook > 0 || st.other > 0) && (
              <span className="block text-[11.5px] text-ink-faint tabular-nums">
                YouTube {money(st.youtube)}
                {st.facebook > 0 ? ` · Facebook ${money(st.facebook)}` : ""}
                {st.other > 0 ? ` · other ${money(st.other)}` : ""}
              </span>
            )}
          </span>
        </div>

        {!res ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-12 rounded-xl" style={{ opacity: 1 - i * 0.16 }} />
            ))}
          </div>
        ) : "error" in res ? (
          <p className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-[13px] text-ink-soft">{res.error}</p>
        ) : data && data.videos.length ? (
          <ul className="rounded-xl border border-line/10 divide-y divide-line/10 overflow-hidden">
            {data.videos.map((v, i) => {
              const share = st.youtube > 0 ? Math.round((v.revenue / st.youtube) * 100) : null;
              return (
                <li key={v.id} className="px-3 py-2.5 flex items-center gap-2.5 sm:gap-3 min-w-0 animate-[fadein_.25s_ease_both]" style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}>
                  <span className="w-5 text-right text-[11.5px] font-bold text-ink-faint tabular-nums flex-shrink-0">{i + 1}</span>
                  <span className="relative w-11 h-11 sm:w-[72px] sm:h-[40px] rounded-md overflow-hidden bg-surface-2 flex-shrink-0">
                    {v.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start sm:items-center gap-1.5 min-w-0">
                      <Link href={`/analytics/video/youtube/${encodeURIComponent(v.id)}?from=overview`} className="text-[13px] font-semibold leading-snug hover:underline min-w-0" title="Open its analytics">
                        <span className="line-clamp-2 sm:line-clamp-none sm:truncate block">{v.title || "A video"}</span>
                      </Link>
                      <a href={v.url} target="_blank" rel="noopener noreferrer" aria-label="Open on YouTube" className="text-ink-faint hover:text-ink flex-shrink-0 mt-0.5 sm:mt-0">
                        <ExternalIcon className="w-3 h-3" />
                      </a>
                    </span>
                    <span className="flex items-center flex-wrap gap-x-1.5 text-[11.5px] text-ink-faint min-w-0">
                      <MarkIcon kind={v.kind} className="w-3 h-3" />
                      <span>{KIND_LABEL[v.kind]}</span>
                      {v.views !== null && <span className="whitespace-nowrap">· {fmtCompact(v.views)} views</span>}
                      {v.rpm !== null && <span className="whitespace-nowrap">· {money(v.rpm)} per 1,000</span>}
                      {v.ours && (
                        <Link href={v.ours.kind === "short" ? `/shorts/${v.ours.id}` : `/videos/${v.ours.id}`} className="font-mono font-semibold text-amber hover:underline">
                          #{v.ours.number ?? "?"}
                        </Link>
                      )}
                    </span>
                  </span>
                  <span className="text-right flex-shrink-0 w-[5.25rem] sm:w-[7rem]">
                    <span className="block text-[14px] font-bold tabular-nums">{money(v.revenue)}</span>
                    <span className="block h-1 rounded-[2px] bg-line/10 mt-1 overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-[3px] bg-[rgb(var(--chart-yt))]" style={{ width: `${top > 0 ? Math.max(3, (v.revenue / top) * 100) : 0}%` }} />
                    </span>
                    <span className="block text-[10.5px] text-ink-faint mt-0.5">{share !== null && share <= 100 ? `${share}% of YouTube's` : ""}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-[13px] text-ink-soft">{data?.note ?? "No video made money on YouTube then."}</p>
        )}

        {income.length > 0 && (
          <div>
            <p className="text-[12.5px] font-semibold text-ink-soft mb-2">Other income then</p>
            <ul className="rounded-xl border border-line/10 divide-y divide-line/10 overflow-hidden">
              {income.map((e) => (
                <li key={e.id} className="px-3 py-2 flex items-center gap-3 text-[13px] min-w-0">
                  <span className="text-ink-faint tabular-nums whitespace-nowrap">{fmtDay(e.day, { month: "short", day: "numeric" })}</span>
                  <span className="flex-1 min-w-0 truncate">
                    {sourceLabel(e.source)}
                    {e.note ? <span className="text-ink-faint"> · {e.note}</span> : null}
                  </span>
                  <b className="tabular-nums">{money(e.amount)}</b>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1 text-[11.5px] text-ink-faint">
          {data && data.videos.length > 0 && st.youtube > 0 && st.youtube - listed > Math.max(0.01, st.youtube * 0.03) && <p>{money(st.youtube - listed)} more came from other videos (below YouTube&rsquo;s top 25), Premium and the like.</p>}
          {st.facebook > 0 && <p>Facebook&rsquo;s earnings aren&rsquo;t split by video.</p>}
          <p>YouTube&rsquo;s revenue is an estimate, and it can change for a few days after.</p>
        </div>
      </div>
    </Dialog>
  );
}
