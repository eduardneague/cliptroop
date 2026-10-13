import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PLATFORMS, type SocialPlatform } from "@/lib/social/providers";
import { numbersVisibility, visibleRows } from "./accounts";
import { safeUrl } from "./queries";

/*
 * Analytics' realtime (1.19.0): what the videos got over the last 48 hours,
 * hour by hour, and in the last 60 minutes, from the counts the 10-minute
 * job keeps (migration 0083, lib/live.ts). Read with the person's own
 * rights: teammates only, the accounts connected now only.
 */

export type RealtimeVideo = {
  platform: SocialPlatform;
  id: string;
  title: string | null;
  thumbnail: string | null;
  url: string | null;
  kind: "short" | "long" | "post";
  publishedAt: string | null;
  /** Views in the last 48 hours / the last 60 minutes. */
  views48: number;
  views60: number;
  ours: { kind: "short" | "long"; id: string; number: number | null } | null;
};
export type RealtimePlatform = {
  platform: SocialPlatform;
  /** When the 10-minute job last read it, and what went wrong then. */
  liveAt: string | null;
  error: string | null;
  followers: number | null;
  totalViews: number | null;
  /** Videos on the account (as the platform counts them) and the ones ClipTroop has. */
  videos: number | null;
  counted: number;
};
export type Realtime = {
  /** False before migration 0083 (nothing to show yet). */
  ready: boolean;
  updatedAt: string | null;
  /** The last 48 hours, oldest first (the last one is the hour going on now). */
  hours: { at: string; views: number; per: Partial<Record<SocialPlatform, number>> }[];
  /** Views in the last 48 hours / 60 minutes, per platform. */
  last48: Partial<Record<SocialPlatform, number>>;
  last60: Partial<Record<SocialPlatform, number>>;
  /** Since when there are counts (realtime fills in over its first 48 hours). */
  since: string | null;
  platforms: RealtimePlatform[];
  top: RealtimeVideo[];
  /** YouTube's impressions and CTR: what's missing, if anything (turn the Reporting API on…). */
  reachNote: string | null;
};

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const HOUR = 3_600_000;

export async function getRealtime(teamId: string): Promise<Realtime> {
  const supabase = await createClient();
  const empty: Realtime = { ready: false, updatedAt: null, hours: [], last48: {}, last60: {}, since: null, platforms: [], top: [], reachNote: null };
  const [vis, syncs, hoursRes, g60, g48, first] = await Promise.all([
    numbersVisibility(supabase, teamId),
    supabase.from("analytics_syncs").select("platform, live_at, live_error, live_totals, reach_note").eq("team_id", teamId),
    supabase.rpc("analytics_live_hours", { p_team: teamId, p_hours: 48 }),
    supabase.rpc("analytics_live_gains", { p_team: teamId, p_minutes: 60 }),
    supabase.rpc("analytics_live_gains", { p_team: teamId, p_minutes: 2880 }),
    supabase.from("analytics_live").select("at").eq("team_id", teamId).order("at", { ascending: true }).limit(1),
  ]);
  // Before migration 0083: nothing yet.
  if (syncs.error || hoursRes.error) return empty;
  const shown = PLATFORMS.filter((p) => vis.platforms.has(p));
  const on = (p: unknown): p is SocialPlatform => shown.includes(p as SocialPlatform);

  // 48 hourly slots ending with the hour going on now.
  const nowHour = Math.floor(Date.now() / HOUR) * HOUR;
  const slots = Array.from({ length: 48 }, (_, i) => nowHour - (47 - i) * HOUR);
  const index = new Map(slots.map((t, i) => [t, i]));
  const hours: Realtime["hours"] = slots.map((t) => ({ at: new Date(t).toISOString(), views: 0, per: {} }));
  for (const r of (hoursRes.data ?? []) as Row[]) {
    if (!on(r.platform)) continue;
    const i = index.get(Math.floor(Date.parse(String(r.hour)) / HOUR) * HOUR);
    const v = n(r.views) ?? 0;
    if (i === undefined || v <= 0) continue;
    hours[i].views += v;
    hours[i].per[r.platform] = (hours[i].per[r.platform] ?? 0) + v;
  }
  const gains = (res: { data: unknown; error: unknown }) => ((res.error ? [] : (res.data ?? [])) as Row[]).filter((r) => on(r.platform) && (n(r.views) ?? 0) > 0);
  const last60Rows = gains(g60);
  const last48Rows = gains(g48);
  const perPlatform = (rows: Row[]) => {
    const out: Partial<Record<SocialPlatform, number>> = {};
    for (const r of rows) out[r.platform as SocialPlatform] = (out[r.platform as SocialPlatform] ?? 0) + (n(r.views) ?? 0);
    return out;
  };

  // The videos getting the most views now (48 hours), with their last 60 minutes.
  const in60 = new Map(last60Rows.map((r) => [`${r.platform}:${r.external_id}`, n(r.views) ?? 0]));
  const best = [...last48Rows].sort((a, b) => (n(b.views) ?? 0) - (n(a.views) ?? 0)).slice(0, 12);
  const ids = [...new Set(best.map((r) => String(r.external_id)))];
  const { data: rows } = ids.length
    ? await supabase
        .from("analytics_content")
        .select("platform, external_id, kind, title, url, thumbnail_url, published_at, short_id, project_id, short_videos(entry_number), long_video_projects(entry_number)")
        .eq("team_id", teamId)
        .in("external_id", ids)
    : { data: [] as Row[] };
  const content = new Map(visibleRows((rows ?? []) as Row[], vis).map((r) => [`${r.platform}:${r.external_id}`, r]));
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
  const top: RealtimeVideo[] = best
    .map((r) => {
      const key = `${r.platform}:${r.external_id}`;
      const c = content.get(key);
      if (!c) return null;
      const s = one(c.short_videos as { entry_number: number } | { entry_number: number }[] | null);
      const l = one(c.long_video_projects as { entry_number: number } | { entry_number: number }[] | null);
      return {
        platform: r.platform as SocialPlatform,
        id: String(r.external_id),
        title: (c.title as string | null) ?? null,
        thumbnail: safeUrl(c.thumbnail_url),
        url: safeUrl(c.url),
        kind: ((c.kind as RealtimeVideo["kind"] | null) ?? "short") as RealtimeVideo["kind"],
        publishedAt: (c.published_at as string | null) ?? null,
        views48: n(r.views) ?? 0,
        views60: in60.get(key) ?? 0,
        ours: c.short_id ? { kind: "short" as const, id: c.short_id as string, number: s?.entry_number ?? null } : c.project_id ? { kind: "long" as const, id: c.project_id as string, number: l?.entry_number ?? null } : null,
      };
    })
    .filter((x): x is RealtimeVideo => x !== null)
    .slice(0, 8);

  // Each platform: when it was last read, its totals now, how many of its videos ClipTroop has.
  const counts = await Promise.all(shown.map((p) => supabase.from("analytics_content").select("external_id", { count: "exact", head: true }).eq("team_id", teamId).eq("platform", p)));
  const syncRows = (syncs.data ?? []) as Row[];
  const platforms: RealtimePlatform[] = shown.map((p, i) => {
    const s = syncRows.find((r) => r.platform === p);
    const t = (s?.live_totals ?? null) as Row | null;
    return {
      platform: p,
      liveAt: (s?.live_at as string | null) ?? null,
      error: (s?.live_error as string | null) ?? null,
      followers: n(t?.followers),
      totalViews: n(t?.total_views),
      videos: n(t?.videos),
      counted: counts[i].count ?? 0,
    };
  });
  const updatedAt = platforms.map((p) => p.liveAt).filter((x): x is string => !!x).sort().pop() ?? null;
  const yt = syncRows.find((r) => r.platform === "youtube");
  return {
    ready: true,
    updatedAt,
    hours,
    last48: perPlatform(last48Rows),
    last60: perPlatform(last60Rows),
    since: ((first.data?.[0] as Row | undefined)?.at as string | undefined) ?? null,
    platforms,
    top,
    reachNote: shown.includes("youtube") ? ((yt?.reach_note as string | null) ?? null) : null,
  };
}
