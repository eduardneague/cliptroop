import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { SocialPlatform } from "@/lib/social/providers";
import { estimateHours, fillHours, usableRatio, type TotalPoint } from "./realtime-math";

/*
 * The hours of realtime (1.22.0), for Realtime and the Overview's 48 hours:
 * each platform's views, likes, comments and shares per hour from the
 * 10-minute counts (0083/0086), with the hours before every video was being
 * counted worked out from the account's own totals (realtime-math.ts) and
 * marked as estimated. Read with the person's own rights.
 */

type Supa = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;
const HOUR = 3_600_000;
const n = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** The days each platform counts in (YouTube's and Facebook's end at midnight Pacific). */
const DAY_TZ: Record<SocialPlatform, string> = { youtube: "America/Los_Angeles", facebook: "America/Los_Angeles", instagram: "UTC", tiktok: "UTC" };

export type PlatformHours = {
  /** Per hour, oldest first: views (counted, or estimated before every video was counted), and what was counted. */
  views: number[];
  counted: number[];
  estimated: boolean[];
  /** 1.23.1: counted hours lifted to the platform's own count (their extra is that, not an estimate from the totals). */
  lifted: boolean[];
  likes: number[];
  comments: number[];
  shares: number[];
};
export type Coverage = {
  /** Since when every video is counted (null: not yet). */
  since: string | null;
  /** How many of the hours were worked out from the account's totals, and how many fell short with nothing to work them out from. */
  estimated: number;
  partial: number;
  /**
   * 1.23.1: the platform's own count ÷ the public counts, when realtime is
   * lifted by it (null: it isn't), and the days it was measured on.
   */
  ratio: number | null;
  ratioFrom: string | null;
  ratioTo: string | null;
};
export type LiveHours = {
  /** Each hour's start (ms), oldest first; the last is the hour going on now. */
  slots: number[];
  per: Partial<Record<SocialPlatform, PlatformHours>>;
  coverage: Partial<Record<SocialPlatform, Coverage>>;
  /** The first count kept at all. */
  first: string | null;
  /** False before migration 0083 (nothing counted yet). */
  ready: boolean;
};

export async function liveHours(supabase: Supa, teamId: string, shown: SocialPlatform[], count: number): Promise<LiveHours> {
  const nowHour = Math.floor(Date.now() / HOUR) * HOUR;
  const slots = Array.from({ length: count }, (_, i) => nowHour - (count - 1 - i) * HOUR);
  const fromIso = new Date(slots[0] - 6 * HOUR).toISOString();
  const fromDay = new Date(slots[0] - 2 * 86_400_000).toISOString().slice(0, 10);
  const [series, syncs, totals, daily, first] = await Promise.all([
    supabase.rpc("analytics_live_series", { p_team: teamId, p_hours: count }).then((r) => (r.error ? supabase.rpc("analytics_live_hours", { p_team: teamId, p_hours: count }) : r)),
    // (Before 0088 there's no live_ratio, before 0086 no live_since: without them.)
    supabase
      .from("analytics_syncs")
      .select("platform, live_since, live_totals, live_ratio")
      .eq("team_id", teamId)
      .then((r) => (r.error ? supabase.from("analytics_syncs").select("platform, live_since, live_totals").eq("team_id", teamId) : r))
      .then((r) => (r.error ? supabase.from("analytics_syncs").select("platform, live_totals").eq("team_id", teamId) : r)),
    supabase.from("analytics_live_totals").select("platform, at, total_views").eq("team_id", teamId).gte("at", fromIso).not("total_views", "is", null).order("at").limit(5000),
    supabase.from("analytics_daily").select("platform, day, views, total_views, updated_at").eq("team_id", teamId).eq("content", "all").gte("day", fromDay).limit(200),
    supabase.from("analytics_live").select("platform, at").eq("team_id", teamId).order("at", { ascending: true }).limit(1),
  ]);
  const out: LiveHours = { slots, per: {}, coverage: {}, first: (((first.data ?? []) as Row[])[0]?.at as string | undefined) ?? null, ready: !series.error };
  if (series.error) return out;
  const index = new Map(slots.map((t, i) => [t, i]));
  const blank = () => slots.map(() => 0);
  for (const r of (series.data ?? []) as Row[]) {
    const p = r.platform as SocialPlatform;
    if (!shown.includes(p)) continue;
    const i = index.get(Math.floor(Date.parse(String(r.hour)) / HOUR) * HOUR);
    if (i === undefined) continue;
    const x = (out.per[p] ??= { views: blank(), counted: blank(), estimated: slots.map(() => false), lifted: slots.map(() => false), likes: blank(), comments: blank(), shares: blank() });
    x.counted[i] += Math.max(0, n(r.views) ?? 0);
    x.likes[i] += Math.max(0, n(r.likes) ?? 0);
    x.comments[i] += Math.max(0, n(r.comments) ?? 0);
    x.shares[i] += Math.max(0, n(r.shares) ?? 0);
  }
  const syncRows = (syncs.error ? [] : (syncs.data ?? [])) as Row[];
  const totalRows = (totals.error ? [] : (totals.data ?? [])) as Row[];
  const dayRows = (daily.error ? [] : (daily.data ?? [])) as Row[];
  for (const p of shown) {
    const x = (out.per[p] ??= { views: blank(), counted: blank(), estimated: slots.map(() => false), lifted: slots.map(() => false), likes: blank(), comments: blank(), shares: blank() });
    const s = syncRows.find((r) => r.platform === p);
    // Since when every video is counted (0086); before it, from the first count on.
    const sinceIso = s && "live_since" in s ? ((s.live_since as string | null) ?? null) : out.first;
    const since = sinceIso ? Date.parse(sinceIso) : null;
    // The account's running total of views: kept every read (0086), the latest, and each morning's copy.
    const points: TotalPoint[] = totalRows.filter((r) => r.platform === p).map((r) => ({ at: Date.parse(String(r.at)), total: n(r.total_views) ?? NaN }));
    const now = (s?.live_totals ?? null) as Row | null;
    if (now && n(now.total_views) !== null && typeof now.at === "string") points.push({ at: Date.parse(now.at), total: n(now.total_views)! });
    for (const r of dayRows) if (r.platform === p && n(r.total_views) !== null && typeof r.updated_at === "string") points.push({ at: Date.parse(r.updated_at), total: n(r.total_views)! });
    const days = new Map<string, number>();
    for (const r of dayRows) if (r.platform === p && n(r.views) !== null) days.set(String(r.day), n(r.views)!);
    const est = estimateHours(points.filter((q) => Number.isFinite(q.at) && Number.isFinite(q.total)), days, slots, DAY_TZ[p]);
    // The public counts lifted to the platform's own count (1.23.1), when they come in clearly under it.
    const lr = (s && "live_ratio" in s ? (s.live_ratio as Row | null) : null) ?? null;
    const ratio = usableRatio(lr);
    const f = fillHours(x.counted, slots, since, est.values, { from: est.from, scale: ratio ?? 1 });
    x.views = f.views;
    x.estimated = f.estimated;
    x.lifted = f.scaled.map((v, i) => v && !(since === null || slots[i] + HOUR <= since));
    out.coverage[p] = {
      since: sinceIso,
      // (Worked out from the totals: the estimated hours the ratio alone didn't make.)
      estimated: f.estimated.filter((v, i) => v && (since === null || slots[i] + HOUR <= since)).length,
      partial: f.partial.filter((v, i) => v && x.counted[i] > 0).length,
      ratio: ratio !== null && f.scaled.some(Boolean) ? ratio : null,
      ratioFrom: ratio !== null && typeof lr?.from === "string" ? lr.from : null,
      ratioTo: ratio !== null && typeof lr?.to === "string" ? lr.to : null,
    };
  }
  return out;
}
