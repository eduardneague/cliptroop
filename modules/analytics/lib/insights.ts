import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PLATFORMS } from "@/lib/social/providers";
import { addDays, dayList, todayIn } from "./ranges";
import { numbersVisibility, visibleRows } from "./accounts";
import { all, contentCols, dailyCols, getPlatformStatus, safeUrl, type PlatformStatus } from "./queries";
import { crossPlatform, findPatterns, type Finding, type PatternKind, type PatternVideo, type Patterns, type Platform } from "./patterns";
import { isWide } from "./kinds";
import { hooksFor, localParts } from "./advanced";
import { readCurve, summarize, type RetentionPoint } from "./retention";
import { outlierScores } from "./scores";
import { dailySeries, total, weightedAvg, type DailyRow } from "./trend-math";
import { allAlerts, allBestTimes, breakoutAlerts, ctrAlert, followerAlerts, gapAlerts, momentumAlerts, slumpAlerts, type Alert, type Heat, type InsightVideo } from "./insights-math";

/*
 * Analytics → Insights (1.20.0): every hint in one place. What changed
 * lately (alerts), "What works" for every platform and kind of video (the
 * patterns of 1.16.0, no longer one platform at a time), the best time to
 * post, and the same shorts on each platform. Read with the person's own
 * rights; the accounts connected now only.
 */

type Row = Record<string, unknown>;
export type PlatformFinding = Finding & { platform: Platform; kind: PatternKind };
export type Insights = {
  alerts: Alert[];
  /** Each platform's shorts (and long videos) with enough to compare, most videos first. */
  patterns: Patterns[];
  cross: Finding | null;
  /** Best time to post: every platform together first (1.27.5), then each platform's own. */
  heat: Heat[];
  /** Platforms with videos but not enough yet for a map of their own (they're in "every platform" already). */
  heatWaiting: { platform: Platform; kind: PatternKind; have: number }[];
  status: PlatformStatus[];
  /** Videos looked at. */
  videos: number;
};
export type InsightsPreview = { alerts: Alert[]; findings: PlatformFinding[] };

const n = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
/** The videos' columns Insights reads. */
const INSIGHT_COLS =
  "platform, external_id, kind, title, url, thumbnail_url, published_at, duration_seconds, views, likes, comments, shares, saves, avg_view_pct, skip_rate, subscribers_gained, short_id, project_id, short_videos(entry_number, short_type), long_video_projects(entry_number, video_type, hook)";
const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export async function getInsights(teamId: string, tz: string, o: { light?: boolean } = {}): Promise<Insights> {
  const supabase = await createClient();
  const today = todayIn(tz);
  // Only the columns used (not each video's `metrics`): from migration 0083 on, every one of them is there.
  const [contentSel, daySel] = await Promise.all([contentCols(), dailyCols()]);
  const cols = contentSel.includes("impressions") ? INSIGHT_COLS : "*, short_videos(entry_number, short_type), long_video_projects(entry_number, video_type, hook)";
  const [status, vis, content, curves, daily] = await Promise.all([
    getPlatformStatus(teamId),
    numbersVisibility(supabase, teamId),
    all((a, b) => supabase.from("analytics_content").select(cols).eq("team_id", teamId).order("published_at", { ascending: false, nullsFirst: false }).order("external_id").range(a, b), 3000),
    o.light ? Promise.resolve([] as Row[]) : all((a, b) => supabase.from("analytics_retention").select("platform, external_id, points").eq("team_id", teamId).in("platform", ["youtube", "facebook"]).range(a, b), 3000),
    // 8 weeks and a day: this week next to last week, 28 days next to the 28 before.
    all<DailyRow>((a, b) => supabase.from("analytics_daily").select(daySel).eq("team_id", teamId).gte("day", addDays(today, -58)).lte("day", today).order("day").order("platform").order("content").range(a, b), 20_000),
  ]);
  // (Every stored video is the connected account's: another account's are deleted when it's replaced.)
  const rows = visibleRows(content, vis);
  const hooks = o.light ? new Map<string, string>() : await hooksFor(supabase, rows);
  const curveOf = new Map(curves.map((r) => [`${r.platform}:${r.external_id}`, readCurve(r.points) as RetentionPoint[]]));

  const pv: PatternVideo[] = rows.map((r) => {
    const p = r.platform as Platform;
    const id = r.external_id as string;
    const kind = r.kind as PatternVideo["kind"];
    const dur = n(r.duration_seconds);
    const curve = curveOf.get(`${p}:${id}`) ?? [];
    const sum = curve.length >= 2 ? summarize(curve, dur) : null;
    const when = r.published_at ? localParts(r.published_at as string, tz) : { hour: null, weekday: null };
    const sv = one(r.short_videos as Row | Row[] | null);
    return {
      platform: p,
      id,
      kind,
      title: (r.title as string | null) ?? null,
      publishedAt: (r.published_at as string | null) ?? null,
      durationSec: dur,
      views: n(r.views),
      likes: n(r.likes),
      comments: n(r.comments),
      shares: n(r.shares),
      saves: n(r.saves),
      avgViewPct: n(r.avg_view_pct),
      skipRate: n(r.skip_rate),
      subscribersGained: n(r.subscribers_gained),
      hold3s: (isWide(kind) ? sum?.at30s : sum?.at3s) ?? null,
      ourId: r.short_id ? (r.short_id as string) : null,
      shortType: (r.short_id ? ((sv?.short_type as PatternVideo["shortType"]) ?? null) : null) ?? null,
      hook: hooks.get(`${r.short_id ? "s" : "l"}:${(r.short_id ?? r.project_id) as string}`) ?? null,
      hour: when.hour,
      weekday: when.weekday,
      thumbnail: safeUrl(r.thumbnail_url),
    };
  });

  // "What works": every platform and kind that has videos.
  const patterns: Patterns[] = [];
  for (const p of PLATFORMS) {
    if (!vis.platforms.has(p)) continue;
    // (1.22.0: live streams on their own, never mixed into long videos.)
    for (const kind of ["short", "long", "live"] as const) {
      if (!pv.some((v) => v.platform === p && v.kind === kind)) continue;
      const res = findPatterns(pv, { platform: p as Platform, kind });
      if (res.considered + res.tooNew > 0) patterns.push(res);
    }
  }
  patterns.sort((a, b) => b.considered - a.considered);

  // "× typical" for every video: the alerts and the best time to post.
  const scores = outlierScores(pv.map((v) => ({ id: `${v.platform}:${v.id}`, platform: v.platform, kind: v.kind, publishedAt: v.publishedAt, views: v.views })));
  const iv: InsightVideo[] = pv.map((v) => ({
    platform: v.platform,
    id: v.id,
    kind: v.kind,
    title: v.title,
    publishedAt: v.publishedAt,
    views: v.views,
    score: scores.get(`${v.platform}:${v.id}`)?.score ?? null,
    hour: v.hour ?? null,
    weekday: v.weekday ?? null,
  }));
  const now = Date.now();
  const { heat, waiting: heatWaiting } = allBestTimes(
    iv,
    patterns.map((p) => ({ platform: p.platform, kind: p.kind })),
    now
  );

  // What changed: the days up to yesterday (today's numbers come tomorrow morning).
  const dRows = visibleRows(daily, vis);
  const last = addDays(today, -1);
  const days56 = dayList(addDays(last, -55), last);
  const shown = PLATFORMS.filter((p) => vis.platforms.has(p)) as Platform[];
  const series = new Map(shown.map((p) => [p, dailySeries(dRows, p, days56)]));
  const momentum = momentumAlerts(shown.map((p) => ({ platform: p, views: series.get(p)!.views.slice(-14) })));
  const followers = followerAlerts(shown.map((p) => ({ platform: p, net: series.get(p)!.followers.slice(-7) })));
  const yt = series.get("youtube");
  const ctr = yt
    ? ctrAlert(weightedAvg(yt.ctr.slice(28), yt.impressions.slice(28)), weightedAvg(yt.ctr.slice(0, 28), yt.impressions.slice(0, 28)), total(yt.impressions.slice(28)))
    : null;
  const alerts = allAlerts([momentum, breakoutAlerts(iv, now), slumpAlerts(iv, now), gapAlerts(iv, now), [ctr], followers], 10);

  return { alerts, patterns, cross: crossPlatform(pv), heat, heatWaiting, status, videos: pv.length };
}

/** The Overview's few hints: the biggest alerts and the clearest findings (without hooks or retention: quick). */
export async function getInsightsPreview(teamId: string, tz: string): Promise<InsightsPreview> {
  const i = await getInsights(teamId, tz, { light: true });
  const findings: PlatformFinding[] = i.patterns
    // (Without their examples: the Overview's card only names them.)
    .flatMap((p) => p.findings.map(({ sides: _sides, ...f }) => ({ ...f, platform: p.platform, kind: p.kind })))
    .sort((a, b) => Number(b.strength === "strong") - Number(a.strength === "strong") || Math.abs(Math.log(b.ratio ?? 1)) - Math.abs(Math.log(a.ratio ?? 1)));
  return { alerts: i.alerts.slice(0, 3), findings: findings.slice(0, Math.max(1, 4 - Math.min(3, i.alerts.length))) };
}

export type { Alert, Heat };
