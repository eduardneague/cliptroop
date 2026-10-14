import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/social/tokens";
import { FB_GRAPH, hasStatsScopes, isSocialPlatform, STATS_SCOPES, type SocialPlatform } from "@/lib/social/providers";
import { sameAccount } from "./accounts";
import { ApiError, get, inBatches, NEW_CONTENT_COLS, num, upsert, upsertSome, YT, type Admin } from "./sync-core";
import { IG, linksFor, refreshYouTubeVideoNumbers, teamMoneyCurrency, youtubeHistory, ytContentRow, YT_VIDEO_PARTS, type Account, type Links, type YtVideo } from "./sync";
import { youtubeVideoDetails } from "./sync-advanced";
import { syncReach } from "./reach";
import { liveDue, snapshotsOf, type CountKey, type Counts, type SeenCounts, type Snapshot } from "./live-math";

/*
 * Numbers within minutes (1.19.0). Every 10 minutes the timer (0083) calls
 * once per team and platform; each call:
 *   - reads the public counts (views, likes, comments, shares) of the videos
 *     that matter now ("hot": the newest, posted in the last week, gaining
 *     views in the last day), and every few hours of EVERY video on the
 *     account (YouTube's whole uploads list, every TikTok, every Instagram
 *     post, every Facebook Reel; a long list goes on where the last call
 *     stopped). New videos are added, the rest refreshed;
 *   - keeps a video's counts in analytics_live whenever they changed
 *     (Analytics' realtime: views per hour, the last 60 minutes, top now)
 *     and on analytics_content (with live_at);
 *   - refreshes the other numbers of a few videos each time, the oldest
 *     first (YouTube's watch time, average view duration, engaged views,
 *     money and retention; Instagram's and Facebook's views and reach), so
 *     none stays stale for long;
 *   - keeps the account's totals now (subscribers, all-time views…) on
 *     analytics_syncs.live_totals: the per-day rows stay the morning copy's,
 *     whose day-to-day changes are what a day got;
 *   - YouTube: downloads new reach reports (impressions and CTR) once an hour.
 * The morning copy (sync.ts) still does the per-day totals, countries,
 * revenue and Advanced. API costs: YouTube list calls are 1 unit per 50
 * videos, and an upload costs 1,600 of the default 10,000 a day: about 3
 * units a call between full passes (the newest 50 and up to 50 more), 40 for
 * a full pass of a 1,000-video channel every 6 hours: ~600 units a day.
 * YouTube Analytics and Reporting have their own quotas.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3_600_000;
/**
 * How often every video is read, not just the hot ones. 1.22.0: YouTube every
 * 3 hours (was 6), so the views older videos get show up in realtime sooner.
 */
const FULL_EVERY: Record<SocialPlatform, number> = { youtube: 3 * HOUR, tiktok: 3 * HOUR, instagram: 6 * HOUR, facebook: 6 * HOUR };
/** YouTube: videos read per call between full passes (the newest 50 and the ones getting views), 1 unit per 50. */
const HOT_YT = 150;
/** How many videos get their other numbers refreshed per call (the oldest first). */
const DETAILS_PER_RUN: Record<SocialPlatform, number> = { youtube: 50, tiktok: 0, instagram: 15, facebook: 15 };
/** Instagram and Facebook: at most this many hot videos' views per call (one call each). */
const HOT_INSIGHTS = 10;
/** YouTube retention curves (with their traffic sources) per call. */
const CURVES_PER_RUN = 3;
const HOT_MAX = 150;
const REACH_EVERY = HOUR;
type Key = CountKey;

type State = {
  account_ref: string | null;
  last_ok_at: string | null;
  live_full_at: string | null;
  live_cursor: string | null;
  reach_job: string | null;
  reach_after: string | null;
  reach_checked_at: string | null;
};
type Ctx = { admin: Admin; acc: Account; links: Links; full: boolean; deadline: number; now: string; state: State; totals: Record<string, number | null> };
type PlatformResult = { videos: number; changed: number; details: number; complete: boolean; cursor: string | null; reachState?: Record<string, unknown> };
export type LiveResult = { ok: boolean; platform?: SocialPlatform; videos?: number; changed?: number; details?: number; full?: boolean; complete?: boolean; reach?: string | null; note?: string; error?: string };

/** The timer's call ({"job": "live", team, platform}). */
export async function runLiveJob(o: { team?: unknown; platform?: unknown }) {
  if (typeof o.team !== "string" || !UUID.test(o.team) || !isSocialPlatform(o.platform)) return { ok: false, job: "live" as const, error: "Which team and platform?" };
  if (!liveDue()) return { ok: true, job: "live" as const, team: o.team, platform: o.platform, note: `Not this time (LIVE_MINUTES=${process.env.LIVE_MINUTES}).` };
  return { job: "live" as const, team: o.team, ...(await liveTeamPlatform(o.team, o.platform)) };
}

/** One team and platform: the hot videos now, every video when it's time (or `full`). Never throws. */
export async function liveTeamPlatform(teamId: string, platform: SocialPlatform, o: { full?: boolean; budgetMs?: number } = {}): Promise<LiveResult> {
  const admin = createAdminClient();
  const deadline = Date.now() + Math.max(8_000, o.budgetMs ?? 45_000);
  const { data: acc } = await admin.from("social_accounts").select("id, team_id, platform, external_id, scopes, username, display_name").eq("team_id", teamId).eq("platform", platform).eq("status", "active").maybeSingle();
  if (!acc) return { ok: true, platform, note: "No account connected." };
  if (!hasStatsScopes(platform, (acc.scopes as string[] | null) ?? [])) return { ok: true, platform, note: "This account doesn't allow stats." };
  const { data: s, error } = await admin
    .from("analytics_syncs")
    .select("account_ref, last_ok_at, live_full_at, live_cursor, reach_job, reach_after, reach_checked_at")
    .eq("team_id", teamId)
    .eq("platform", platform)
    .maybeSingle();
  if (error) return { ok: false, platform, error: "Needs the latest database update (migration 0083)." };
  const state = s as State | null;
  // The morning copy (or Sync now) takes the account on first: until then, nothing here.
  if (!state?.last_ok_at) return { ok: true, platform, note: "Waiting for the first copy." };
  if (!sameAccount(state.account_ref, { externalId: (acc.external_id as string) ?? "", name: ((acc.username as string | null) ?? (acc.display_name as string | null)) ?? null }))
    return { ok: true, platform, note: "Another account's numbers are kept: waiting for the morning copy." };
  const full = !!o.full || !!state.live_cursor || !state.live_full_at || Date.now() - Date.parse(state.live_full_at) > FULL_EVERY[platform];
  const now = new Date().toISOString();
  // Since when every video is counted (0086; before it, the column isn't there).
  const since = await admin.from("analytics_syncs").select("live_since").eq("team_id", teamId).eq("platform", platform).maybeSingle();
  const liveSince = since.error ? undefined : (((since.data as { live_since?: string | null } | null)?.live_since ?? null) as string | null);
  try {
    const ctx: Ctx = { admin, acc: acc as Account, links: await linksFor(admin, teamId), full, deadline, now, state, totals: {} };
    const r = platform === "youtube" ? await liveYouTube(ctx) : platform === "tiktok" ? await liveTikTok(ctx) : platform === "instagram" ? await liveInstagram(ctx) : await liveFacebook(ctx);
    const patch: Record<string, unknown> = { live_at: now, live_error: null };
    if (full) {
      patch.live_cursor = r.complete ? null : r.cursor;
      if (r.complete) patch.live_full_at = now;
      // The first pass over every video is done: from now on each one is counted (realtime is exact from here).
      if (r.complete && liveSince === null) patch.live_since = now;
    }
    if (r.reachState) Object.assign(patch, r.reachState);
    const totals = Object.fromEntries(Object.entries(ctx.totals).filter(([, v]) => v !== null && v !== undefined));
    if (Object.keys(totals).length) {
      patch.live_totals = { ...totals, at: now };
      // …and kept over time (0086): realtime's hours before every video was counted, followers per hour.
      const t = totals as Record<string, number>;
      const { error: totalsError } = await admin
        .from("analytics_live_totals")
        .upsert({ team_id: teamId, platform, at: now, followers: t.followers ?? null, total_views: t.total_views ?? null, videos: t.videos ?? null }, { onConflict: "team_id,platform,at", ignoreDuplicates: true });
      void totalsError; // (Before migration 0086 there's no table: nothing to keep.)
    }
    await admin.from("analytics_syncs").update(patch).eq("team_id", teamId).eq("platform", platform);
    return { ok: true, platform, videos: r.videos, changed: r.changed, details: r.details, full, complete: r.complete, reach: (r.reachState?.reach_note as string | null | undefined) ?? null };
  } catch (e) {
    const message = (e instanceof Error ? e.message : "Unknown error").slice(0, 400);
    await admin.from("analytics_syncs").update({ live_at: now, live_error: message }).eq("team_id", teamId).eq("platform", platform);
    return { ok: false, platform, full, error: message };
  }
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const left = (ctx: Ctx, ms = 0) => Date.now() < ctx.deadline - ms;

/** The videos worth reading often: gaining views in the last day, and posted in the last week. */
async function hotIds(ctx: Ctx, platform: SocialPlatform): Promise<string[]> {
  const out = new Set<string>();
  try {
    const { data } = await ctx.admin.rpc("analytics_live_gains", { p_team: ctx.acc.team_id, p_minutes: 1440 });
    ((data ?? []) as { platform: string; external_id: string; views: number | null }[])
      .filter((r) => r.platform === platform && (num(r.views) ?? 0) > 0)
      .sort((a, b) => (num(b.views) ?? 0) - (num(a.views) ?? 0))
      .slice(0, HOT_MAX)
      .forEach((r) => out.add(r.external_id));
  } catch {}
  const { data: recent } = await ctx.admin
    .from("analytics_content")
    .select("external_id")
    .eq("team_id", ctx.acc.team_id)
    .eq("platform", platform)
    .gte("published_at", new Date(Date.now() - 7 * 24 * HOUR).toISOString())
    .order("published_at", { ascending: false })
    .limit(HOT_MAX);
  for (const r of (recent ?? []) as { external_id: string }[]) out.add(r.external_id);
  return [...out];
}

type Snap = { team_id: string; platform: SocialPlatform; external_id: string; at: string } & Counts;

/**
 * Saves the videos read now: their rows (with live_at), and their counts in
 * analytics_live when they changed or for a first look (lib/live-math.ts
 * snapshotsOf: also the counts as last seen, at that moment, never over a
 * moment already kept). `keys`: the counts this read has.
 */
async function saveLive(ctx: Ctx, platform: SocialPlatform, list: Record<string, unknown>[], keys: Key[]): Promise<number> {
  // (The same video twice in one save would fail the whole upsert.)
  const rows = [...new Map(list.map((r) => [String(r.external_id), r])).values()];
  if (!rows.length) return 0;
  const teamId = ctx.acc.team_id;
  const seen = new Map<string, SeenCounts>();
  const ids = rows.map((r) => String(r.external_id));
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await ctx.admin
      .from("analytics_content")
      .select("external_id, views, likes, comments, shares, live_at, updated_at")
      .eq("team_id", teamId)
      .eq("platform", platform)
      .in("external_id", ids.slice(i, i + 200));
    if (error) throw new ApiError(`Reading the videos: ${error.message}`);
    for (const r of (data ?? []) as Record<string, unknown>[])
      seen.set(String(r.external_id), {
        views: num(r.views),
        likes: num(r.likes),
        comments: num(r.comments),
        shares: num(r.shares),
        liveAt: (r.live_at as string | null) ?? null,
        updatedAt: (r.updated_at as string | null) ?? null,
      });
  }
  const read = rows.map((r) => ({ id: String(r.external_id), counts: Object.fromEntries(keys.map((k) => [k, num(r[k])])) as Partial<Counts>, publishedAt: typeof r.published_at === "string" ? r.published_at : null }));
  const { fresh, before } = snapshotsOf(read, seen, keys, ctx.now);
  const row = (x: Snapshot): Snap => ({ team_id: teamId, platform, external_id: x.id, at: x.at, views: x.views, likes: x.likes, comments: x.comments, shares: x.shares });
  await upsertSome(ctx.admin, "analytics_content", rows.map((r) => ({ ...r, live_at: ctx.now })), "team_id,platform,external_id", ["live_at", ...NEW_CONTENT_COLS]);
  const old = before.map(row);
  for (let i = 0; i < old.length; i += 500) {
    const { error } = await ctx.admin.from("analytics_live").upsert(old.slice(i, i + 500), { onConflict: "team_id,platform,external_id,at", ignoreDuplicates: true });
    if (error) throw new ApiError(`Saving analytics_live: ${error.message}`);
  }
  if (fresh.length) await upsert(ctx.admin, "analytics_live", fresh.map(row), "team_id,platform,external_id,at");
  return fresh.length;
}

type StaleVideo = { id: string; publishedAt: string | null };

/**
 * The videos whose other numbers are the oldest (never fetched first).
 * Facebook: Reels only (a Page post's id is "page_post"; the morning copy
 * reads those).
 */
async function staleVideos(ctx: Ctx, platform: SocialPlatform, n: number, skip: string[] = []): Promise<StaleVideo[]> {
  if (n <= 0) return [];
  let query = ctx.admin.from("analytics_content").select("external_id, published_at").eq("team_id", ctx.acc.team_id).eq("platform", platform);
  if (platform === "facebook") query = query.not("external_id", "like", "%\\_%");
  const { data, error } = await query.order("details_at", { ascending: true, nullsFirst: true }).limit(n + skip.length);
  if (error) return [];
  return ((data ?? []) as { external_id: string; published_at: string | null }[])
    .filter((r) => !skip.includes(r.external_id))
    .slice(0, n)
    .map((r) => ({ id: r.external_id, publishedAt: r.published_at }));
}

/** Meta's "too many calls" (codes 4, 17, 32, 613): stop asking for this call. */
const rateLimited = (e: unknown) => e instanceof ApiError && (e.status === 429 || /request limit|rate limit|too many calls|\(#(4|17|32|613)\)/i.test(e.message));

// ---------------------------------------------------------------------------
// YouTube: the whole uploads list every 3 hours, the hot ones every 10 minutes
// ---------------------------------------------------------------------------

/** Uploads from `start` (a page token) on: up to `pages` pages, until `until`. `next`: where to go on (null at the end). */
async function uploadPages(token: string, playlist: string, start: string | undefined, pages: number, until: number): Promise<{ ids: string[]; next: string | null }> {
  const ids: string[] = [];
  let page = start;
  for (let i = 0; i < pages; i++) {
    if (i > 0 && Date.now() > until) return { ids, next: page ?? null };
    const r = (await get(`${YT}/playlistItems?${new URLSearchParams({ part: "contentDetails", playlistId: playlist, maxResults: "50", ...(page ? { pageToken: page } : {}) })}`, token)) as {
      items?: { contentDetails?: { videoId?: string } }[];
      nextPageToken?: string;
    };
    for (const it of r.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    if (!r.nextPageToken) return { ids, next: null };
    page = r.nextPageToken;
  }
  return { ids, next: page ?? null };
}

async function ytVideosQuick(token: string, ids: string[]): Promise<YtVideo[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const lists = await inBatches(chunks, 4, async (chunk) => {
    const r = (await get(`${YT}/videos?${new URLSearchParams({ part: YT_VIDEO_PARTS, id: chunk.join(","), maxResults: "50" })}`, token)) as { items?: YtVideo[] };
    return r.items ?? [];
  });
  return lists.flat();
}

async function liveYouTube(ctx: Ctx): Promise<PlatformResult> {
  const token = await getAccessToken(ctx.acc.id);
  // The channel's totals every 30 minutes (and on full passes). Its uploads list is
  // the channel's id with UU for UC, so the calls in between save a unit of quota.
  const cid = ctx.acc.external_id ?? "";
  let uploads: string | null = /^UC[\w-]{10,}$/.test(cid) ? `UU${cid.slice(2)}` : null;
  const channel = async () => {
    const ch = (await get(`${YT}/channels?part=contentDetails,statistics&mine=true`, token)) as {
      items?: { statistics?: Record<string, string>; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
    };
    const st = ch.items?.[0]?.statistics;
    if (st) Object.assign(ctx.totals, { followers: num(st.subscriberCount), total_views: num(st.viewCount), videos: num(st.videoCount) });
    return ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
  };
  let asked = false;
  if (!uploads || ctx.full || Math.floor(new Date().getUTCMinutes() / 10) % 3 === 0) {
    uploads = (await channel()) ?? uploads;
    asked = true;
  }

  // The newest 50 always; every 6 hours all the others too (going on where the last call stopped).
  let ids: string[] = [];
  let complete = true;
  let cursor: string | null = null;
  let whole = false;
  if (uploads) {
    let first: Awaited<ReturnType<typeof uploadPages>>;
    try {
      first = await uploadPages(token, uploads, undefined, 1, Infinity);
    } catch (e) {
      // (The worked-out list's name wasn't right: ask the channel for it.)
      if (asked || !(e instanceof ApiError && e.status === 404)) throw e;
      uploads = (await channel()) ?? uploads;
      first = await uploadPages(token, uploads, undefined, 1, Infinity);
    }
    ids = first.ids;
    if (ctx.full) {
      const from = ctx.state.live_cursor ?? first.next;
      if (!from) whole = true;
      else {
        try {
          const rest = await uploadPages(token, uploads, from, 400, ctx.deadline - 25_000);
          ids.push(...rest.ids);
          cursor = rest.next;
          complete = rest.next === null;
          whole = complete && !ctx.state.live_cursor;
        } catch (e) {
          if (!ctx.state.live_cursor) throw e;
          // A page token YouTube no longer knows: from the start next time.
          complete = false;
          cursor = null;
        }
      }
    }
  }
  if (!whole) {
    // The ones getting views now and the week's: up to 100 videos in all (2 units of quota).
    const have = new Set(ids);
    const room = ctx.full ? 50 : Math.max(0, HOT_YT - ids.length);
    ids.push(...(await hotIds(ctx, "youtube")).filter((id) => !have.has(id)).slice(0, room));
  }
  const vids = ids.length ? await ytVideosQuick(token, [...new Set(ids)]) : [];
  const rows = vids.map((v) => ytContentRow(ctx.acc, v, ctx.links));
  const changed = await saveLive(ctx, "youtube", rows, ["views", "likes", "comments"]);

  // The other numbers (YouTube Analytics: a day or two behind anyway), the
  // oldest first; live streams YouTube hasn't named yet go first (1.22.0: a
  // premiere looks like one until YouTube says it's a video).
  let details = 0;
  const money = (ctx.acc.scopes ?? []).includes(STATS_SCOPES.youtube[1]);
  if (left(ctx, 15_000)) {
    const streams = vids.filter((v) => v.liveStreamingDetails?.actualStartTime).map((v) => v.id);
    let unnamed: string[] = [];
    if (streams.length) {
      const { data, error } = await ctx.admin.from("analytics_content").select("external_id").eq("team_id", ctx.acc.team_id).eq("platform", "youtube").is("content_type", null).in("external_id", streams.slice(0, 50));
      if (!error) unnamed = ((data ?? []) as { external_id: string }[]).map((r) => r.external_id);
    }
    const stale = await staleVideos(ctx, "youtube", Math.max(0, DETAILS_PER_RUN.youtube - unnamed.length), unnamed);
    const ids = [...unnamed, ...stale.map((v) => v.id)];
    if (ids.length) {
      const adv = { admin: ctx.admin, teamId: ctx.acc.team_id, deadline: ctx.deadline - 12_000 };
      await refreshYouTubeVideoNumbers(ctx.admin, ctx.acc.team_id, token, ids, { money, currency: money ? await teamMoneyCurrency(ctx.admin, ctx.acc.team_id) : null, deadline: ctx.deadline - 14_000 });
      details = ids.length;
      // Retention curves and traffic sources: a few per call (never fetched first).
      if (left(ctx, 14_000)) await youtubeVideoDetails(adv, token, stale, CURVES_PER_RUN).catch(() => 0);
    }
  }
  // The channel's older years (1.21.0), while they aren't all in: a year per
  // call when there's time (the morning copy does the same), so Lifetime
  // reaches the channel's first day within the hour, not over a few mornings.
  if (!ctx.full && left(ctx, 22_000)) {
    const adv = { admin: ctx.admin, teamId: ctx.acc.team_id, deadline: ctx.deadline - 10_000 };
    await youtubeHistory(ctx.admin, ctx.acc, token, { monetary: money, currency: await teamMoneyCurrency(ctx.admin, ctx.acc.team_id), deadline: ctx.deadline - 18_000, adv }).catch((e) => {
      console.error("[analytics history, live]", e instanceof Error ? e.message : e);
      return 0;
    });
  }

  // Impressions and CTR: new reach reports, once an hour.
  let reachState: Record<string, unknown> | undefined;
  const checked = ctx.state.reach_checked_at ? Date.parse(ctx.state.reach_checked_at) : 0;
  if (Date.now() - checked > REACH_EVERY && left(ctx, 10_000)) {
    const r = await syncReach(ctx.admin, ctx.acc.team_id, token, { job: ctx.state.reach_job, after: ctx.state.reach_after }, ctx.deadline - 3_000);
    reachState = { reach_job: r.job, reach_after: r.after, reach_checked_at: ctx.now, reach_note: r.note };
  }
  return { videos: rows.length, changed, details, complete, cursor, reachState };
}

// ---------------------------------------------------------------------------
// TikTok: its list has every number (all of them every 3 hours, the hot ones by id)
// ---------------------------------------------------------------------------

const TT_FIELDS = "id,title,create_time,view_count,like_count,comment_count,share_count,cover_image_url,share_url,duration";
type TtPage = { data?: { videos?: Record<string, unknown>[]; cursor?: number; has_more?: boolean } };

function ttRow(ctx: Ctx, v: Record<string, unknown>) {
  const id = String(v.id);
  const link = ctx.links.byExternal.get(`tiktok:${id}`) ?? ctx.links.byUrl(id);
  return {
    team_id: ctx.acc.team_id,
    platform: "tiktok",
    external_id: id,
    kind: link?.project ? "long" : "short",
    title: String(v.title ?? "").slice(0, 200) || null,
    url: (v.share_url as string) ?? null,
    thumbnail_url: (v.cover_image_url as string) ?? null,
    published_at: num(v.create_time) ? new Date(num(v.create_time)! * 1000).toISOString() : null,
    duration_seconds: num(v.duration),
    views: num(v.view_count),
    likes: num(v.like_count),
    comments: num(v.comment_count),
    shares: num(v.share_count),
    short_id: link?.short ?? null,
    project_id: link?.project ?? null,
    updated_at: ctx.now,
  };
}

async function liveTikTok(ctx: Ctx): Promise<PlatformResult> {
  const token = await getAccessToken(ctx.acc.id);
  const vids = new Map<string, Record<string, unknown>>();
  const page = async (cursor: number | null) => {
    const r = (await get(`https://open.tiktokapis.com/v2/video/list/?fields=${TT_FIELDS}`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
    })) as TtPage;
    for (const v of r.data?.videos ?? []) vids.set(String(v.id), v);
    return r.data?.has_more && r.data.cursor ? r.data.cursor : null;
  };
  // The newest 20 always; every 3 hours all the others too (going on where the last call stopped).
  const afterFirst = await page(null);
  let complete = true;
  let cursor: string | null = null;
  let whole = false;
  if (ctx.full) {
    const saved = ctx.state.live_cursor && /^\d{1,20}$/.test(ctx.state.live_cursor) ? Number(ctx.state.live_cursor) : null;
    let next: number | null = saved ?? afterFirst;
    try {
      while (next !== null && left(ctx, 10_000)) next = await page(next);
      complete = next === null;
      cursor = next === null ? null : String(next);
      whole = complete && saved === null;
    } catch (e) {
      if (saved === null && vids.size <= 20) throw e;
      complete = false;
      cursor = saved !== null ? null : next !== null ? String(next) : null;
    }
  }
  if (!whole) {
    // The hot ones by id, 20 at a time.
    const hot = (await hotIds(ctx, "tiktok")).filter((id) => !vids.has(id));
    for (let i = 0; i < hot.length && left(ctx, 8_000); i += 20) {
      try {
        const r = (await get(`https://open.tiktokapis.com/v2/video/query/?fields=${TT_FIELDS}`, token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: { video_ids: hot.slice(i, i + 20) } }),
        })) as { data?: { videos?: Record<string, unknown>[] } };
        for (const v of r.data?.videos ?? []) vids.set(String(v.id), v);
      } catch {
        break;
      }
    }
  }
  try {
    const user = (await get("https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count", token)) as { data?: { user?: Record<string, unknown> } };
    const u = user.data?.user ?? {};
    Object.assign(ctx.totals, { followers: num(u.follower_count), total_likes: num(u.likes_count), videos: num(u.video_count) });
  } catch {}
  // Every video in one go: their views add up to the account's (1.22.0, realtime's running total).
  if (whole) ctx.totals.total_views = [...vids.values()].reduce((t, v) => t + (num(v.view_count) ?? 0), 0);
  const rows = [...vids.values()].map((v) => ttRow(ctx, v));
  const changed = await saveLive(ctx, "tiktok", rows, ["views", "likes", "comments", "shares"]);
  return { videos: rows.length, changed, details: 0, complete, cursor };
}

// ---------------------------------------------------------------------------
// Instagram: every post every 6 hours (likes, comments); views per post from
// its insights: the hot ones every 10 minutes, the rest a few at a time
// ---------------------------------------------------------------------------

const IG_FIELDS = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count";
type Media = { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; thumbnail_url?: string; media_url?: string; timestamp?: string; like_count?: number; comments_count?: number };
type GraphPage<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } };
type Query = (path: string, p: Record<string, string>) => Promise<unknown>;

/**
 * A Graph API list (Instagram posts, Facebook Reels): the first page always,
 * on a full call all the others too, going on from the saved cursor.
 */
async function graphList<T>(ctx: Ctx, q: Query, path: string, fields: string): Promise<{ items: T[]; complete: boolean; cursor: string | null }> {
  const items: T[] = [];
  const read = async (after?: string) => {
    const r = (await q(path, { fields, limit: ctx.full ? "100" : "25", ...(after ? { after } : {}) })) as GraphPage<T>;
    items.push(...(r.data ?? []));
    return r.paging?.next && r.paging.cursors?.after ? r.paging.cursors.after : null;
  };
  const afterFirst = await read();
  if (!ctx.full) return { items, complete: true, cursor: null };
  const saved = ctx.state.live_cursor;
  let next: string | null = saved ?? afterFirst;
  try {
    while (next && left(ctx, 15_000)) next = await read(next);
    return { items, complete: next === null, cursor: next };
  } catch (e) {
    if (!saved) throw e;
    // A cursor Meta no longer takes: from the start next time.
    return { items, complete: false, cursor: null };
  }
}

async function liveInstagram(ctx: Ctx): Promise<PlatformResult> {
  const token = await getAccessToken(ctx.acc.id);
  const igId = ctx.acc.external_id ?? "me";
  const q: Query = (path, p) => get(`${IG()}/${path}?${new URLSearchParams({ ...p, access_token: token })}`, "");
  const { items: media, complete, cursor } = await graphList<Media>(ctx, q, `${igId}/media`, IG_FIELDS);
  try {
    const me = (await q(igId, { fields: "followers_count,media_count" })) as Record<string, unknown>;
    Object.assign(ctx.totals, { followers: num(me.followers_count), videos: num(me.media_count) });
  } catch {}
  const listRow = (m: Media) => {
    const link = ctx.links.byExternal.get(`instagram:${m.id}`) ?? (m.permalink ? ctx.links.byUrl(m.permalink) : null);
    return {
      team_id: ctx.acc.team_id,
      platform: "instagram",
      external_id: m.id,
      kind: link?.short ? "short" : link?.project ? "long" : m.media_product_type === "REELS" ? "short" : "post",
      title: (m.caption ?? "").split("\n")[0].slice(0, 200) || null,
      url: m.permalink ?? null,
      thumbnail_url: m.thumbnail_url ?? (m.media_type === "IMAGE" ? (m.media_url ?? null) : null),
      published_at: m.timestamp ?? null,
      likes: num(m.like_count),
      comments: num(m.comments_count),
      short_id: link?.short ?? null,
      project_id: link?.project ?? null,
      updated_at: ctx.now,
    };
  };
  let changed = await saveLive(ctx, "instagram", media.map(listRow), ["likes", "comments"]);

  // Views (and reach, shares, saves): the newest and the hot ones now, then the oldest-refreshed.
  const recent = media.filter((m) => m.timestamp && Date.now() - Date.parse(m.timestamp) < 3 * 24 * HOUR).map((m) => m.id);
  const hot = [...new Set([...recent, ...(await hotIds(ctx, "instagram"))])].slice(0, HOT_INSIGHTS);
  const stale = (await staleVideos(ctx, "instagram", DETAILS_PER_RUN.instagram, hot)).map((v) => v.id);
  const read: Record<string, unknown>[] = [];
  const marks: Record<string, unknown>[] = [];
  for (const id of [...hot, ...stale]) {
    if (!left(ctx, 5_000)) break;
    try {
      const ins = (await q(`${id}/insights`, { metric: "views,reach,shares,saved" })) as { data?: { name: string; values?: { value?: number }[] }[] };
      const row: Record<string, unknown> = { team_id: ctx.acc.team_id, platform: "instagram", external_id: id, views: null, reach: null, shares: null, saves: null, details_at: ctx.now };
      for (const x of ins.data ?? []) {
        const val = num(x.values?.[0]?.value);
        if (x.name === "views") row.views = val;
        else if (x.name === "reach") row.reach = val;
        else if (x.name === "shares") row.shares = val;
        else if (x.name === "saved") row.saves = val;
      }
      read.push(row);
    } catch (e) {
      if (rateLimited(e)) break;
      // Not shared for this post (posted before the account was a business one…): its turn comes again later.
      marks.push({ team_id: ctx.acc.team_id, platform: "instagram", external_id: id, details_at: ctx.now });
    }
  }
  if (read.length) changed += await saveLive(ctx, "instagram", read, ["views", "shares"]);
  if (marks.length) await upsertSome(ctx.admin, "analytics_content", marks, "team_id,platform,external_id", ["details_at"]);
  return { videos: media.length, changed, details: read.length + marks.length, complete, cursor };
}

// ---------------------------------------------------------------------------
// Facebook: every Reel every 6 hours; plays per Reel from its insights (the
// hot ones every 10 minutes, the rest a few at a time)
// ---------------------------------------------------------------------------

async function liveFacebook(ctx: Ctx): Promise<PlatformResult> {
  const token = await getAccessToken(ctx.acc.id);
  const pageId = ctx.acc.external_id ?? "me";
  const q: Query = (path, p) => get(`${FB_GRAPH()}/${path}?${new URLSearchParams({ ...p, access_token: token })}`, "");
  const { items: listed, complete, cursor } = await graphList<Record<string, unknown>>(ctx, q, `${pageId}/video_reels`, "id,description,created_time,permalink_url,picture");
  try {
    const p = (await q(pageId, { fields: "followers_count,fan_count" })) as { followers_count?: number; fan_count?: number };
    Object.assign(ctx.totals, { followers: num(p.followers_count) ?? num(p.fan_count) });
  } catch {}
  // A Reel the morning copy keeps as a Page post (its link has the Reel's id) stays that one row.
  const { data: posts } = await ctx.admin.from("analytics_content").select("external_id, url").eq("team_id", ctx.acc.team_id).eq("platform", "facebook").like("external_id", "%\\_%").limit(5000);
  const inPosts = new Set(((posts ?? []) as { url: string | null }[]).flatMap((r) => (r.url ?? "").match(/\d{6,}/g) ?? []));
  const reels = listed.filter((m) => !inPosts.has(String(m.id)));
  const listRow = (m: Record<string, unknown>) => {
    const id = String(m.id);
    const raw = (m.permalink_url as string | undefined) ?? "";
    const url = raw ? (raw.startsWith("http") ? raw : `https://www.facebook.com${raw.startsWith("/") ? "" : "/"}${raw}`) : `https://www.facebook.com/reel/${id}`;
    const link = ctx.links.byExternal.get(`facebook:${id}`) ?? ctx.links.byUrl(id);
    return {
      team_id: ctx.acc.team_id,
      platform: "facebook",
      external_id: id,
      kind: link?.project ? "long" : "short",
      title: String(m.description ?? "").split("\n")[0].slice(0, 200) || null,
      url,
      thumbnail_url: (m.picture as string | undefined) ?? null,
      published_at: (m.created_time as string | undefined) ? new Date(m.created_time as string).toISOString() : null,
      short_id: link?.short ?? null,
      project_id: link?.project ?? null,
      updated_at: ctx.now,
    };
  };
  // (Rows without counts: their stored counts stay.)
  if (reels.length) await upsertSome(ctx.admin, "analytics_content", reels.map(listRow), "team_id,platform,external_id", []);

  const total = (v: unknown) => (v && typeof v === "object" ? Object.values(v as Record<string, unknown>).reduce<number>((t, x) => t + (num(x) ?? 0), 0) : num(v));
  const part = (v: unknown, key: string) => (v && typeof v === "object" ? num(Object.entries(v as Record<string, unknown>).find(([k]) => k.toLowerCase() === key)?.[1]) : null);
  const recent = reels.filter((m) => m.created_time && Date.now() - Date.parse(String(m.created_time)) < 3 * 24 * HOUR).map((m) => String(m.id));
  const hot = [...new Set([...recent, ...(await hotIds(ctx, "facebook"))])].filter((id) => !id.includes("_")).slice(0, HOT_INSIGHTS);
  const stale = (await staleVideos(ctx, "facebook", DETAILS_PER_RUN.facebook, hot)).map((v) => v.id);
  const read: Record<string, unknown>[] = [];
  const marks: Record<string, unknown>[] = [];
  let limited = false;
  await inBatches([...hot, ...stale], 5, async (id) => {
    if (limited || !left(ctx, 5_000)) return;
    try {
      const ins = (await q(`${id}/video_insights`, { metric: "blue_reels_play_count,post_video_likes_by_reaction_type,post_video_social_actions", period: "lifetime" })) as {
        data?: { name: string; values?: { value: unknown }[] }[];
      };
      const row: Record<string, unknown> = { team_id: ctx.acc.team_id, platform: "facebook", external_id: id, views: null, likes: 0, comments: 0, shares: 0, details_at: ctx.now };
      for (const d of ins.data ?? []) {
        const v = d.values?.[0]?.value;
        if (d.name === "blue_reels_play_count") row.views = num(v);
        else if (d.name === "post_video_likes_by_reaction_type") row.likes = total(v) ?? 0;
        else if (d.name === "post_video_social_actions") {
          row.comments = part(v, "comment") ?? 0;
          row.shares = part(v, "share") ?? 0;
        }
      }
      read.push(row);
    } catch (e) {
      if (rateLimited(e)) limited = true;
      else marks.push({ team_id: ctx.acc.team_id, platform: "facebook", external_id: id, details_at: ctx.now });
    }
  });
  const changed = await saveLive(ctx, "facebook", read, ["views", "likes", "comments", "shares"]);
  if (marks.length) await upsertSome(ctx.admin, "analytics_content", marks, "team_id,platform,external_id", ["details_at"]);
  return { videos: reels.length, changed, details: read.length + marks.length, complete, cursor };
}
