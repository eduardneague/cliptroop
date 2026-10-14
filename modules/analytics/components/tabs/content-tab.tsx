"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { ContentList, type ContentKind } from "../content-list";
import { fmtCompact } from "../charts";
import { PLATFORM, type P, ALL_P, statusText, StatusRow, AccountNote, SetupCard } from "./shared";
import type { ContentItem, PlatformStatus } from "../../lib/queries";

/*
 * Analytics → Content (1.20.0): like YouTube Studio's, a tab per kind
 * (everything, long videos, Shorts, posts) with its totals, then every
 * video with its numbers. One video by name: the app's search (top bar, or
 * "/") lists videos with their numbers too.
 */

const KINDS: { id: ContentKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "long", label: "Long videos" },
  { id: "short", label: "Shorts" },
  { id: "post", label: "Posts" },
];

/**
 * One row of platform chips: All, then every platform (with its count and
 * how its copy is doing). Pick one to see only its videos; pick it again,
 * or All, for everything.
 */
function ContentFilter({ items, status, platform, setPlatform }: { items: ContentItem[]; status: PlatformStatus[]; platform: "all" | P; setPlatform: (p: "all" | P) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Platform">
      <button
        type="button"
        onClick={() => setPlatform("all")}
        aria-pressed={platform === "all"}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-[12px] font-semibold border transition-colors ${
          platform === "all" ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"
        }`}
      >
        All
        <span className={`font-medium tabular-nums ${platform === "all" ? "text-paper/60" : "text-ink-faint"}`}>{items.length}</span>
      </button>
      {ALL_P.map((p) => {
        const s = status.find((x) => x.platform === p);
        const n = items.filter((i) => i.platform === p).length;
        const on = platform === p;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            title={s?.lastError ?? undefined}
            onClick={() => setPlatform(on ? "all" : p)}
            className={`inline-flex items-center gap-2 rounded-lg border pl-1 pr-3 h-8 text-[12px] font-semibold transition-colors ${
              on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)]" : "border-line/15 bg-surface/50 hover:bg-surface"
            } ${s?.lastError && s.connected ? "!border-red/40" : ""}`}
          >
            <PlatformIcon platform={p} className={`w-6 h-6 rounded-md ${s?.connected || n ? "" : "opacity-40 grayscale"}`} />
            <span className="text-ink">{PLATFORM[p].name}</span>
            <span className="text-ink-faint font-medium tabular-nums">{n}</span>
            {s && <span className="hidden sm:inline text-ink-faint font-medium">· {statusText(s)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ContentTab({
  items,
  status,
  every,
  rangeLabel,
  advancedHref,
}: {
  items: ContentItem[];
  status: PlatformStatus[];
  /** Lifetime: every video (the range above decides which videos are listed). */
  every: boolean;
  /** "28 days" (null for lifetime and custom ranges). */
  rangeLabel: string | null;
  advancedHref: string;
}) {
  const [platform, setPlatform] = useState<"all" | P>("all");
  const [kind, setKind] = useState<ContentKind>("all");
  const inPlatform = useMemo(() => items.filter((i) => platform === "all" || i.platform === platform), [items, platform]);
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, k.id === "all" ? inPlatform.length : inPlatform.filter((i) => i.kind === k.id).length])) as Record<ContentKind, number>, [inPlatform]);
  const listed = kind === "all" ? inPlatform : inPlatform.filter((i) => i.kind === kind);
  const sums = useMemo(() => {
    const add = (f: (i: ContentItem) => number | null | undefined) => {
      const xs = listed.map(f).filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x));
      return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
    };
    const impressions = add((i) => i.impressions);
    const shortViews = add((i) => (i.kind === "short" ? i.views : null));
    const longViews = add((i) => (i.kind === "long" ? i.views : null));
    const clicks = add((i) => (i.impressions && i.ctr !== null && i.ctr !== undefined ? (i.impressions * i.ctr) / 100 : null));
    return { views: add((i) => i.views), shortViews, longViews, likes: add((i) => i.likes), comments: add((i) => i.comments), shares: add((i) => i.shares), impressions, ctr: impressions && clicks !== null ? (clicks / impressions) * 100 : null };
  }, [listed]);
  if (!status.some((s) => s.connected) && !items.length)
    return (
      <>
        <StatusRow status={status} />
        <SetupCard status={status} />
      </>
    );
  const picked = platform === "all" ? null : status.find((s) => s.platform === platform) ?? null;
  const when = every ? "" : rangeLabel ? ` in the last ${rangeLabel}` : " in this range";
  return (
    <div className="space-y-4">
      {/* A tab per kind, like YouTube Studio's Content. */}
      <nav aria-label="Kind of video" className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-line/10 -mt-1">
        {KINDS.filter((k) => k.id === "all" || counts[k.id] > 0 || kind === k.id).map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id)}
            className={`relative px-3 h-10 inline-flex items-center gap-1.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors ${kind === k.id ? "text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {k.label}
            <span className="text-[11.5px] font-medium text-ink-faint tabular-nums">{counts[k.id]}</span>
            <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-ink transition-opacity ${kind === k.id ? "opacity-100" : "opacity-0"}`} />
          </button>
        ))}
      </nav>

      <ContentFilter items={items} status={status} platform={platform} setPlatform={setPlatform} />
      <AccountNote status={platform === "all" ? status : status.filter((s) => s.platform === platform)} />

      {listed.length > 0 && (
        <dl className="grid gap-px rounded-2xl border border-line/10 bg-line/10 overflow-hidden grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Videos", listed.length.toLocaleString("en-US"), every ? "every video" : `published${when}`],
            [
              "Views",
              fmtCompact(sums.views),
              // Shorts and long videos apart when the list has both.
              sums.shortViews !== null && sums.longViews !== null ? `shorts ${fmtCompact(sums.shortViews)} · long ${fmtCompact(sums.longViews)}` : "their totals now",
            ],
            ["Likes", fmtCompact(sums.likes), null],
            ["Comments", fmtCompact(sums.comments), null],
            ["Impressions", sums.impressions === null ? "–" : fmtCompact(sums.impressions), sums.impressions === null ? "YouTube only" : "YouTube"],
            ["Impressions CTR", sums.ctr === null ? "–" : `${sums.ctr.toFixed(1)}%`, sums.ctr === null ? "YouTube only" : "weighted by impressions"],
          ].map(([label, value, hint]) => (
            <div key={label as string} className="bg-surface px-4 py-3 min-w-0">
              <dt className="text-[12px] text-ink-soft truncate">{label}</dt>
              <dd className="font-display text-[22px] font-semibold leading-tight tabular-nums mt-0.5">{value}</dd>
              {hint && <dd className="text-[11px] text-ink-faint truncate">{hint}</dd>}
            </div>
          ))}
        </dl>
      )}

      <ContentList
        items={items}
        platform={platform}
        kind={kind}
        empty={
          picked && !picked.connected
            ? `${PLATFORM[picked.platform].name} isn't connected, and nothing was posted there in this range.`
            : picked && !picked.statsReady
              ? `Nothing posted to ${PLATFORM[picked.platform].name} ${every ? "yet" : "in this range"}. Its numbers need one more permission: reconnect it in Team → Connected accounts.`
              : `Nothing published${picked ? ` on ${PLATFORM[picked.platform].name}` : ""} ${every ? "yet" : "in this range"}.`
        }
        left={
          <p className="text-[12.5px] text-ink-faint">
            Looking for one video? Search for it at the top (<kbd className="font-mono text-[11px] rounded border border-line/20 px-1">/</kbd>): it shows its numbers too.
          </p>
        }
      />
      <p className="text-[12px] text-ink-faint">
        Every video on each connected account, with its totals now: the newest and the ones getting views are read every 10 minutes, all the others every few hours. Impressions and CTR are
        YouTube&rsquo;s (thumbnail impressions and click-through rate over the days YouTube keeps). Shorts the team posted show here too, with &ldquo;–&rdquo; until the platform shares their
        numbers. &ldquo;× typical&rdquo;: views next to the median of the same kind posted before it, on the same platform. Only the accounts connected now are listed.
      </p>
      <p className="text-[12.5px] text-ink-soft">
        Every number for all the videos together (retention, where views came from):{" "}
        <Link href={advancedHref} scroll={false} className="font-semibold text-amber hover:underline">
          Advanced →
        </Link>
      </p>
    </div>
  );
}
