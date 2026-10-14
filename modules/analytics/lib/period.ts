import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PLATFORMS, type SocialPlatform } from "@/lib/social/providers";
import { numbersVisibility, visibleRows } from "./accounts";
import { safeUrl } from "./queries";
import { addMissingYouTubeVideos, fetchYouTubePeriodVideos, type PeriodVideoRow } from "./sync";
import { isKind, type VideoKind } from "./kinds";
import type { PeriodMetric, PeriodVideo, PeriodVideos } from "./period-types";
import { metricOf } from "./period-types";

/*
 * What each video got in one point of a chart (1.22.0): any day, week,
 * month or stretch (or one of the 48 hours), for any of the Overview's
 * numbers. YouTube answers per video for exactly those days (asked each
 * time, kept 10 minutes); impressions come from its reach reports;
 * Instagram, TikTok and Facebook only share running totals, so theirs is the
 * change between the copies around those days; an hour comes from the
 * 10-minute counts. Read with the person's own rights.
 */

export { PERIOD_METRICS, isPeriodMetric, metricOf, type PeriodMetric, type PeriodVideo, type PeriodVideos } from "./period-types";

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// YouTube's answers, kept 10 minutes (per server): stepping back and forth is instant.
const asked = new Map<string, { at: number; rows: PeriodVideoRow[] | null }>();

export async function getPeriodVideos(
  teamId: string,
  o: { from: string; to: string; hourly: boolean; metric: PeriodMetric; platforms: SocialPlatform[]; revenueAllowed: boolean; currency: string | null }
): Promise<PeriodVideos> {
  const supabase = await createClient();
  const vis = await numbersVisibility(supabase, teamId);
  const ps = PLATFORMS.filter((p) => vis.platforms.has(p) && (!o.platforms.length || o.platforms.includes(p)));
  const out: PeriodVideos = { from: o.from, to: o.to, hourly: o.hourly, metric: o.metric, currency: o.revenueAllowed ? o.currency : null, videos: [], notes: [] };
  if (!ps.length) return out;
  type Part = Omit<PeriodVideo, "title" | "thumbnail" | "url" | "kind" | "publishedAt" | "ours">;
  const parts: Part[] = [];
  const blank = (platform: SocialPlatform, id: string, how: PeriodVideo["how"]): Part => ({
    platform,
    id,
    views: null,
    watchMinutes: null,
    likes: null,
    comments: null,
    shares: null,
    subscribers: null,
    impressions: null,
    ctr: null,
    avgViewSeconds: null,
    avgViewPct: null,
    revenue: null,
    how,
  });

  if (o.hourly) {
    // One hour (or any stretch of the last 8 days): what each video gained, from the 10-minute counts.
    const { data, error } = await supabase.rpc("analytics_live_window", { p_team: teamId, p_from: o.from, p_to: o.to });
    if (error) out.notes.push("Needs the latest database update (migration 0086) to list an hour's videos.");
    for (const r of ((error ? [] : data) ?? []) as Row[]) {
      const p = r.platform as SocialPlatform;
      if (!ps.includes(p)) continue;
      const x = blank(p, String(r.external_id), "live");
      x.views = n(r.views);
      x.likes = n(r.likes);
      x.comments = n(r.comments);
      x.shares = p === "youtube" || p === "instagram" ? null : n(r.shares);
      if ((x.views ?? 0) > 0 || (x.likes ?? 0) > 0 || (x.comments ?? 0) > 0) parts.push(x);
    }
    out.notes.push("From each video's counts, read every few minutes: a change between two reads is spread over the time between them.");
  } else {
    const youtube = ps.includes("youtube");
    const others = ps.filter((p) => p !== "youtube");
    const reach = o.metric === "impressions" || o.metric === "ctr";
    // YouTube, per video for exactly these days (not for impressions: those are the reach reports').
    let ytRows: PeriodVideoRow[] | null = null;
    if (youtube && !reach) {
      const money = o.revenueAllowed && !!o.currency;
      const key = `${teamId}|${o.from}|${o.to}|${o.metric}|${money ? o.currency : ""}`;
      const hit = asked.get(key);
      if (hit && hit.at > Date.now() - 10 * 60_000) ytRows = hit.rows;
      else {
        try {
          ytRows = await fetchYouTubePeriodVideos(teamId, o.from, o.to, { metric: o.metric, money, currency: o.currency ?? "USD", limit: 100 });
          asked.set(key, { at: Date.now(), rows: ytRows });
          if (asked.size > 500) asked.clear();
        } catch (e) {
          console.error("[period videos]", e instanceof Error ? e.message : e);
          out.notes.push("YouTube didn't answer this time: its videos come from ClipTroop's own copy (each day's top 50).");
        }
      }
      for (const r of ytRows ?? []) {
        const x = blank("youtube", r.id, "day");
        x.views = r.views;
        x.watchMinutes = r.watchMinutes;
        x.likes = r.likes;
        x.comments = r.comments;
        x.shares = r.shares;
        x.subscribers = r.subscribersGained === null ? null : r.subscribersGained - (r.subscribersLost ?? 0);
        x.avgViewSeconds = r.avgViewSeconds;
        x.avgViewPct = r.avgViewPct;
        x.revenue = o.revenueAllowed ? r.revenue : null;
        if ((x.views ?? 0) > 0 || (x.revenue ?? 0) > 0 || (x.subscribers ?? 0) !== 0) parts.push(x);
      }
    }
    // From the copies: YouTube's reach (or its per-day copy when YouTube didn't answer), and the others' running totals.
    const fromDb = [...(youtube && (reach || ytRows === null) ? (["youtube"] as SocialPlatform[]) : []), ...others];
    if (fromDb.length) {
      const sort = o.metric === "ctr" ? "impressions" : o.metric === "avgView" || o.metric === "revenue" ? "views" : o.metric;
      const { data, error } = await supabase.rpc("analytics_period_videos", { p_team: teamId, p_from: o.from, p_to: o.to, p_limit: 100, p_platforms: fromDb, p_metric: sort });
      if (error) out.notes.push("Needs the latest database update (migration 0086) for every platform's videos.");
      for (const r of ((error ? [] : data) ?? []) as Row[]) {
        const p = r.platform as SocialPlatform;
        const x = blank(p, String(r.external_id), r.from_totals ? "change" : "day");
        x.views = n(r.views);
        x.watchMinutes = n(r.watch_minutes);
        x.likes = n(r.likes);
        x.comments = n(r.comments);
        x.shares = n(r.shares);
        x.subscribers = n(r.subscribers);
        x.impressions = n(r.impressions);
        const clicks = n(r.clicks);
        x.ctr = x.impressions && clicks !== null ? (clicks / x.impressions) * 100 : null;
        if ((x.views ?? 0) > 0 || (x.impressions ?? 0) > 0 || (x.subscribers ?? 0) !== 0) parts.push(x);
      }
      if (others.length) out.notes.push(`${others.map((p) => NAME[p]).join(", ").replace(/, ([^,]*)$/, " and $1")} only ${others.length === 1 ? "shares" : "share"} running totals: theirs is the change between the morning copy before these days and the one after.`);
      if (reach && youtube) out.notes.push("Impressions and click-through come from YouTube's reach reports, a day or two behind.");
    }
    if (youtube && !reach && ytRows !== null) out.notes.push("YouTube's own numbers for each video on these days. Its latest day can still change.");
  }

  // Titles, pictures and links (an old YouTube upload getting views again is added first).
  const content = await contentFor(supabase, teamId, parts);
  const missing = parts.filter((x) => x.platform === "youtube" && !content.has(`youtube:${x.id}`)).map((x) => x.id);
  if (missing.length) {
    try {
      if (await addMissingYouTubeVideos(teamId, missing.slice(0, 50))) for (const [k, v] of await contentFor(supabase, teamId, parts.filter((x) => missing.includes(x.id)))) content.set(k, v);
    } catch {
      /* listed without a title */
    }
  }
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
  const visible = new Set(visibleRows([...content.values()], vis).map((r) => `${r.platform}:${r.external_id}`));
  out.videos = parts
    .filter((x) => visible.has(`${x.platform}:${x.id}`) || (x.platform === "youtube" && !content.has(`youtube:${x.id}`)))
    .map((x) => {
      const c = content.get(`${x.platform}:${x.id}`);
      const s = one(c?.short_videos as { entry_number: number } | { entry_number: number }[] | null);
      const l = one(c?.long_video_projects as { entry_number: number } | { entry_number: number }[] | null);
      return {
        ...x,
        title: (c?.title as string | null) ?? null,
        thumbnail: safeUrl(c?.thumbnail_url),
        url: safeUrl(c?.url) ?? (x.platform === "youtube" ? `https://www.youtube.com/watch?v=${encodeURIComponent(x.id)}` : null),
        kind: (isKind(c?.kind) ? c?.kind : x.platform === "facebook" ? "post" : "short") as VideoKind,
        publishedAt: (c?.published_at as string | null) ?? null,
        ours: c?.short_id ? { kind: "short" as const, id: c.short_id as string, number: s?.entry_number ?? null } : c?.project_id ? { kind: "long" as const, id: c.project_id as string, number: l?.entry_number ?? null } : null,
      };
    })
    .sort((a, b) => (metricOf(b, o.metric) ?? -Infinity) - (metricOf(a, o.metric) ?? -Infinity) || (b.views ?? 0) - (a.views ?? 0));
  return out;
}

const NAME: Record<SocialPlatform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

async function contentFor(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string, parts: { platform: SocialPlatform; id: string }[]) {
  const out = new Map<string, Row>();
  const byPlatform = new Map<SocialPlatform, string[]>();
  for (const x of parts) byPlatform.set(x.platform, [...(byPlatform.get(x.platform) ?? []), x.id]);
  await Promise.all(
    [...byPlatform].map(async ([p, ids]) => {
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase
          .from("analytics_content")
          .select("platform, external_id, kind, title, url, thumbnail_url, published_at, short_id, project_id, short_videos(entry_number), long_video_projects(entry_number)")
          .eq("team_id", teamId)
          .eq("platform", p)
          .in("external_id", ids.slice(i, i + 150));
        for (const r of (data ?? []) as Row[]) out.set(`${r.platform}:${r.external_id}`, r);
      }
    })
  );
  return out;
}
