import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PLATFORMS, type SocialPlatform } from "@/lib/social/providers";
import { numbersVisibility, visibleRows } from "./accounts";
import { safeUrl } from "./queries";
import { liveHours, type Coverage } from "./live-hours";
import type { VideoKind } from "./kinds";

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
  kind: VideoKind;
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
  /** YouTube shares subscriber counts rounded to 3 digits (22,136 comes as 22,100), for every app, even the channel's owner. */
  followersRounded: boolean;
  totalViews: number | null;
  /** Videos on the account (as the platform counts them) and the ones ClipTroop has. */
  videos: number | null;
  counted: number;
};
export type Realtime = {
  /** False before migration 0083 (nothing to show yet). */
  ready: boolean;
  updatedAt: string | null;
  /**
   * The last 48 hours, oldest first (the last one is the hour going on now).
   * `est`: the part of each platform's views worked out from the account's
   * totals (1.22.0: the hours before every video was being counted).
   */
  hours: { at: string; views: number; per: Partial<Record<SocialPlatform, number>>; est: Partial<Record<SocialPlatform, number>> }[];
  /** Since when each platform's videos are all counted, and how many hours were worked out instead. */
  coverage: Partial<Record<SocialPlatform, Coverage>>;
  /** The last 60 minutes in 10-minute slots ending now, oldest first (the Realtime tab only; migration 0084). */
  minutes: { at: string; views: number; per: Partial<Record<SocialPlatform, number>> }[];
  /** Views in the last 48 hours / 60 minutes, per platform. */
  last48: Partial<Record<SocialPlatform, number>>;
  last60: Partial<Record<SocialPlatform, number>>;
  /** How many videos got views in the last 48 hours / 60 minutes, per platform. */
  active48: Partial<Record<SocialPlatform, number>>;
  active60: Partial<Record<SocialPlatform, number>>;
  /** Likes and comments in the last 48 hours / 60 minutes, per platform. */
  reactions48: Partial<Record<SocialPlatform, { likes: number; comments: number }>>;
  reactions60: Partial<Record<SocialPlatform, { likes: number; comments: number }>>;
  /** Since when there are counts (realtime fills in over its first 48 hours). */
  since: string | null;
  platforms: RealtimePlatform[];
  /** The videos with the most views in the last 48 hours; `top60`: in the last 60 minutes (the Realtime tab only). */
  top: RealtimeVideo[];
  top60: RealtimeVideo[];
  /** YouTube's impressions and CTR: what's missing, if anything (turn the Reporting API on…). */
  reachNote: string | null;
};

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** `full`: the Realtime tab (the last 60 minutes in 10-minute slots, the top 25 videos); else the cards' top 8. */
export async function getRealtime(teamId: string, o: { full?: boolean } = {}): Promise<Realtime> {
  const supabase = await createClient();
  const empty: Realtime = { ready: false, updatedAt: null, hours: [], coverage: {}, minutes: [], last48: {}, last60: {}, active48: {}, active60: {}, reactions48: {}, reactions60: {}, since: null, platforms: [], top: [], top60: [], reachNote: null };
  const vis = await numbersVisibility(supabase, teamId);
  const shown = PLATFORMS.filter((p) => vis.platforms.has(p));
  const on = (p: unknown): p is SocialPlatform => shown.includes(p as SocialPlatform);
  const [syncs, lh, g60, g48, slotsRes] = await Promise.all([
    supabase.from("analytics_syncs").select("platform, live_at, live_error, live_totals, reach_note").eq("team_id", teamId),
    // The 48 hours, with the ones before every video was counted worked out (1.22.0).
    liveHours(supabase, teamId, shown, 48),
    supabase.rpc("analytics_live_gains", { p_team: teamId, p_minutes: 60 }),
    supabase.rpc("analytics_live_gains", { p_team: teamId, p_minutes: 2880 }),
    o.full ? supabase.rpc("analytics_live_buckets", { p_team: teamId, p_minutes: 60, p_step: 10 }) : Promise.resolve({ data: null, error: null }),
  ]);
  // Before migration 0083: nothing yet.
  if (syncs.error || !lh.ready) return empty;

  // 48 hourly slots ending with the hour going on now.
  const hours: Realtime["hours"] = lh.slots.map((t) => ({ at: new Date(t).toISOString(), views: 0, per: {}, est: {} }));
  const reactions48: Realtime["reactions48"] = {};
  const last48: Realtime["last48"] = {};
  for (const p of shown) {
    const x = lh.per[p];
    if (!x) continue;
    reactions48[p] = { likes: x.likes.reduce((a, b) => a + b, 0), comments: x.comments.reduce((a, b) => a + b, 0) };
    x.views.forEach((v, i) => {
      if (v <= 0) return;
      hours[i].views += v;
      hours[i].per[p] = v;
      if (x.estimated[i]) hours[i].est[p] = Math.max(0, v - x.counted[i]);
    });
    last48[p] = x.views.reduce((a, b) => a + b, 0);
  }
  // The last 60 minutes: 6 slots of 10 minutes ending now (before 0084: none).
  const STEP = 600_000;
  const start = Date.now() - 6 * STEP;
  const minutes: Realtime["minutes"] = o.full && !slotsRes.error ? Array.from({ length: 6 }, (_, i) => ({ at: new Date(start + i * STEP).toISOString(), views: 0, per: {} })) : [];
  for (const r of ((slotsRes.error ? [] : slotsRes.data) ?? []) as Row[]) {
    if (!on(r.platform) || !minutes.length) continue;
    // (The database's "now" is a moment before this one: the nearest slot.)
    const i = Math.round((Date.parse(String(r.at)) - start) / STEP);
    const v = n(r.views) ?? 0;
    if (i < 0 || i > 5 || v <= 0) continue;
    minutes[i].views += v;
    minutes[i].per[r.platform] = (minutes[i].per[r.platform] ?? 0) + v;
  }
  const gains = (res: { data: unknown; error: unknown }) => ((res.error ? [] : (res.data ?? [])) as Row[]).filter((r) => on(r.platform) && (n(r.views) ?? 0) > 0);
  const last60Rows = gains(g60);
  const last48Rows = gains(g48);
  const reactions60: Realtime["reactions60"] = {};
  for (const r of ((g60.error ? [] : g60.data) ?? []) as Row[]) {
    if (!on(r.platform)) continue;
    const x = (reactions60[r.platform] ??= { likes: 0, comments: 0 });
    x.likes += Math.max(0, n(r.likes) ?? 0);
    x.comments += Math.max(0, n(r.comments) ?? 0);
  }
  const perPlatform = (rows: Row[]) => {
    const out: Partial<Record<SocialPlatform, number>> = {};
    for (const r of rows) out[r.platform as SocialPlatform] = (out[r.platform as SocialPlatform] ?? 0) + (n(r.views) ?? 0);
    return out;
  };
  const countPerPlatform = (rows: Row[]) => {
    const out: Partial<Record<SocialPlatform, number>> = {};
    for (const r of rows) out[r.platform as SocialPlatform] = (out[r.platform as SocialPlatform] ?? 0) + 1;
    return out;
  };

  // The videos getting the most views now (48 hours), with their last 60 minutes; the tab also the last 60 minutes' own.
  const in60 = new Map(last60Rows.map((r) => [`${r.platform}:${r.external_id}`, n(r.views) ?? 0]));
  const in48 = new Map(last48Rows.map((r) => [`${r.platform}:${r.external_id}`, n(r.views) ?? 0]));
  const limit = o.full ? 25 : 8;
  const byViews = (a: Row, b: Row) => (n(b.views) ?? 0) - (n(a.views) ?? 0);
  const best = [...last48Rows].sort(byViews).slice(0, limit + 4);
  const best60 = o.full ? [...last60Rows].sort(byViews).slice(0, limit + 4) : [];
  const ids = [...new Set([...best, ...best60].map((r) => String(r.external_id)))];
  const { data: rows } = ids.length
    ? await supabase
        .from("analytics_content")
        .select("platform, external_id, kind, title, url, thumbnail_url, published_at, short_id, project_id, short_videos(entry_number), long_video_projects(entry_number)")
        .eq("team_id", teamId)
        .in("external_id", ids)
    : { data: [] as Row[] };
  const content = new Map(visibleRows((rows ?? []) as Row[], vis).map((r) => [`${r.platform}:${r.external_id}`, r]));
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
  const toVideo = (r: Row): RealtimeVideo | null => {
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
      views48: in48.get(key) ?? 0,
      views60: in60.get(key) ?? 0,
      ours: c.short_id ? { kind: "short" as const, id: c.short_id as string, number: s?.entry_number ?? null } : c.project_id ? { kind: "long" as const, id: c.project_id as string, number: l?.entry_number ?? null } : null,
    };
  };
  const top: RealtimeVideo[] = best
    .map(toVideo)
    .filter((x): x is RealtimeVideo => x !== null)
    .slice(0, limit);
  const top60: RealtimeVideo[] = best60
    .map(toVideo)
    .filter((x): x is RealtimeVideo => x !== null)
    .slice(0, limit);

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
      followersRounded: p === "youtube",
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
    coverage: lh.coverage,
    minutes,
    // The hours added up (the counted ones and the ones worked out), as on the chart.
    last48,
    last60: perPlatform(last60Rows),
    active48: countPerPlatform(last48Rows),
    active60: countPerPlatform(last60Rows),
    reactions48,
    reactions60,
    since: lh.first,
    platforms,
    top,
    top60,
    reachNote: shown.includes("youtube") ? ((yt?.reach_note as string | null) ?? null) : null,
  };
}
