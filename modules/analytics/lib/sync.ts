import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/social/tokens";
import { FB_GRAPH, hasStatsScopes, STATS_SCOPES, type SocialPlatform } from "@/lib/social/providers";
import { facebookEarnings } from "./fb-money";
import { adoptAccount, sameAccount } from "./accounts";
import { syncObjectives } from "@/modules/objectives/lib/sync";
import { jobEnd, jobStart } from "@/lib/job-runs";
import { ApiError, dayRange, daysAgo, get, isoDuration, keepStoredMetrics, NEW_CONTENT_COLS, NEW_DAILY_COLS, num, rowsOf, upsert, upsertSome, YT, ytFirst, ytReport, type Admin } from "./sync-core";
import {
  facebookRetention,
  instagramWindows,
  youtubeDailyExtras,
  youtubeDailyMoney,
  youtubeDailySplits,
  youtubeTypeAverages,
  youtubeVideoDetails,
  youtubeVideoExtras,
  youtubeVideoRevenue,
  youtubeWindows,
  type Advanced,
} from "./sync-advanced";
import type { RetentionPoint } from "./retention";

/*
 * Copies the platforms' numbers into our analytics tables (migration 0058).
 * Runs once a day for every team (Supabase's timer, {"job": "analytics"}; lib/daily-jobs.ts) and on "Sync now".
 * The first copy fetches history (90 days of totals, 28 days of the per-day
 * details); later copies refresh the last few days (platforms keep updating
 * recent numbers for a couple of days). Every platform call is official API,
 * read-only. Never throws: problems are saved on analytics_syncs.
 */

type Account = { id: string; team_id: string; platform: SocialPlatform; external_id: string | null; scopes: string[] | null; username?: string | null; display_name?: string | null };
export type SyncResult = { platform: SocialPlatform; ok: boolean; error?: string; rows: number; note?: string | null };

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

async function syncYouTube(admin: Admin, acc: Account, backfill: boolean, links: Links, adv: Advanced): Promise<{ rows: number; revenueNote: string | null; note: string | null }> {
  const token = await getAccessToken(acc.id);
  const start = backfill ? daysAgo(90) : daysAgo(6);
  const end = daysAgo(0);
  let rows = 0;
  const daily = new Map<string, Record<string, unknown>>();
  const put = (day: string, content: string, v: Record<string, unknown>) => {
    const k = `${day}|${content}`;
    daily.set(k, { ...(daily.get(k) ?? { team_id: acc.team_id, platform: "youtube", day, content }), ...v, updated_at: new Date().toISOString() });
  };

  // Totals per day.
  const totals = rowsOf(
    await ytReport(token, {
      startDate: start,
      endDate: end,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost",
      dimensions: "day",
      sort: "day",
    })
  );
  for (const r of totals)
    put(String(r.day), "all", {
      views: num(r.views),
      watch_minutes: num(r.estimatedMinutesWatched),
      avg_view_seconds: num(r.averageViewDuration),
      likes: num(r.likes),
      comments: num(r.comments),
      shares: num(r.shares),
      followers_gained: num(r.subscribersGained),
      followers_lost: num(r.subscribersLost),
    });

  // More per day (migration 0079): engaged views, average % viewed, dislikes,
  // playlist adds. Optional: a channel or an API version without one of
  // them still gets the rest (the shorter list), and the totals above never
  // depend on it.
  for (const metrics of ["engagedViews,averageViewPercentage,dislikes,videosAddedToPlaylists", "averageViewPercentage,dislikes"]) {
    try {
      const extra = rowsOf(await ytReport(token, { startDate: start, endDate: end, metrics, dimensions: "day", sort: "day" }));
      for (const r of extra)
        put(String(r.day), "all", {
          ...(metrics.includes("engagedViews") ? { engaged_views: num(r.engagedViews), playlist_adds: num(r.videosAddedToPlaylists) } : {}),
          avg_view_pct: num(r.averageViewPercentage),
          dislikes: num(r.dislikes),
        });
      break;
    } catch {
      /* try the shorter list, then go without */
    }
  }

  // Shorts vs long videos (creatorContentType). Optional: skipped if YouTube refuses it.
  try {
    const split = rowsOf(
      await ytReport(token, {
        startDate: start,
        endDate: end,
        metrics: "views,estimatedMinutesWatched,likes,comments,shares",
        dimensions: "day,creatorContentType",
        sort: "day",
      })
    );
    const sum = new Map<string, Record<string, number>>();
    for (const r of split) {
      const type = String(r.creatorContentType ?? "");
      const content = type === "SHORTS" ? "shorts" : type === "VIDEO_ON_DEMAND" || type === "LIVE_STREAM" ? "long" : null;
      if (!content) continue;
      const k = `${r.day}|${content}`;
      const s = sum.get(k) ?? { views: 0, watch_minutes: 0, likes: 0, comments: 0, shares: 0 };
      s.views += num(r.views) ?? 0;
      s.watch_minutes += num(r.estimatedMinutesWatched) ?? 0;
      s.likes += num(r.likes) ?? 0;
      s.comments += num(r.comments) ?? 0;
      s.shares += num(r.shares) ?? 0;
      sum.set(k, s);
    }
    for (const [k, v] of sum) {
      const [day, content] = k.split("|");
      put(day, content, v);
    }
  } catch {}

  // Advanced (0081). Shorts vs long videos beyond views: average view
  // duration and % viewed, engaged views, subscribers gained and lost. And
  // the channel's other numbers per day (Premium views, playlist removals,
  // cards) into `metrics`.
  try {
    for (const [k, v] of await youtubeTypeAverages(token, start, end)) {
      const [day, content] = k.split("|");
      put(day, content, v);
    }
  } catch {}
  try {
    for (const [day, m] of await youtubeDailyExtras(token, start, end)) put(day, "all", { metrics: m });
  } catch {}

  // Channel totals right now (subscribers, all-time views) on today's row.
  let videos: { id: string; publishedAt: string | null }[] = [];
  try {
    const ch = (await get(`${YT}/channels?part=statistics,contentDetails&mine=true`, token)) as { items?: { statistics?: Record<string, string>; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] };
    const st = ch.items?.[0]?.statistics;
    if (st) put(end, "all", { followers: num(st.subscriberCount), total_views: num(st.viewCount) });
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (uploads) {
      const v = await syncYouTubeVideos(admin, acc, token, uploads, links);
      rows += v.rows;
      videos = v.videos;
    }
  } catch {}

  rows += await upsertSome(admin, "analytics_daily", await keepStoredMetrics(admin, "analytics_daily", acc.team_id, "youtube", [...daily.values()]), "team_id,platform,day,content", NEW_DAILY_COLS);

  // Each video's views per day (the top 50 of each day), for "what got the
  // views that day" on the chart: the last 4 days (YouTube keeps updating
  // them), 28 on the first copy.
  try {
    rows += await syncYouTubeVideoDays(admin, acc, token, dayRange(daysAgo(backfill ? 28 : 4), daysAgo(1)).reverse(), links);
  } catch {}

  // Countries, one day at a time (the map; YouTube can't split days and
  // countries in one report). Every run refreshes the last 4 days and fills
  // any day of the last 28 that has no countries yet, so one bad run never
  // leaves the map empty for good. A failing day doesn't stop the others.
  const have = new Set(
    ((
      await admin
        .from("analytics_countries")
        .select("day")
        .eq("team_id", acc.team_id)
        .eq("platform", "youtube")
        .eq("metric", "views")
        .gte("day", daysAgo(28))
    ).data ?? []).map((r) => r.day as string)
  );
  const recent = new Set(dayRange(daysAgo(4), daysAgo(1)));
  const countryDays = dayRange(daysAgo(28), daysAgo(1))
    .filter((d) => recent.has(d) || !have.has(d))
    .reverse();
  let countryError: string | null = null;
  let failures = 0;
  for (const day of countryDays) {
    if (failures >= 3) break; // Something's wrong with the report itself: try again next run.
    try {
      const list = rowsOf(await ytReport(token, { startDate: day, endDate: day, metrics: "views,estimatedMinutesWatched", dimensions: "country", sort: "-views" }));
      const recs = list
        .filter((r) => /^[A-Z]{2}$/.test(String(r.country)) && r.country !== "ZZ")
        .map((r) => ({ team_id: acc.team_id, platform: "youtube", metric: "views", day, country: String(r.country), value: num(r.views) ?? 0, watch_minutes: num(r.estimatedMinutesWatched) }));
      if (recs.length) rows += await upsert(admin, "analytics_countries", recs, "team_id,platform,metric,day,country");
      failures = 0;
    } catch (e) {
      failures++;
      countryError ??= e instanceof Error ? e.message : "unknown error";
    }
  }

  // Revenue (needs the monetary permission and a monetized channel).
  let revenueNote: string | null = null;
  const monetary = (acc.scopes ?? []).includes(STATS_SCOPES.youtube[1]);
  const currency = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  if (monetary) {
    try {
      const base = { startDate: start, endDate: end, dimensions: "day", sort: "day", currency };
      // Revenue by stream (ads, YouTube Premium; the rest is memberships, Supers, Shopping…).
      let rev: Record<string, unknown>[];
      let detailed = true;
      try {
        rev = rowsOf(await ytReport(token, { ...base, metrics: "estimatedRevenue,estimatedAdRevenue,estimatedRedPartnerRevenue,grossRevenue" }));
      } catch {
        detailed = false;
        rev = rowsOf(await ytReport(token, { ...base, metrics: "estimatedRevenue" }));
      }
      // CPM, playback-based CPM, ad impressions, monetized playbacks (0081; optional).
      const money = await youtubeDailyMoney(token, start, end, currency).catch(() => new Map<string, Record<string, number | null>>());
      const now = new Date().toISOString();
      const recs: Record<string, unknown>[] = rev.map((r) => ({
        team_id: acc.team_id,
        platform: "youtube",
        day: String(r.day),
        content: "all",
        revenue: num(r.estimatedRevenue) ?? 0,
        currency,
        updated_at: now,
        ...(detailed ? { ad_revenue: num(r.estimatedAdRevenue), premium_revenue: num(r.estimatedRedPartnerRevenue), gross_revenue: num(r.grossRevenue) } : {}),
        ...(money.get(String(r.day)) ?? {}),
      }));
      // Shorts vs long videos.
      try {
        const split = rowsOf(await ytReport(token, { ...base, dimensions: "day,creatorContentType", metrics: "estimatedRevenue" }));
        const byKey = new Map<string, number>();
        for (const r of split) {
          const type = String(r.creatorContentType ?? "");
          const content = type === "SHORTS" ? "shorts" : type === "VIDEO_ON_DEMAND" || type === "LIVE_STREAM" ? "long" : null;
          if (!content) continue;
          const k = `${r.day}|${content}`;
          byKey.set(k, (byKey.get(k) ?? 0) + (num(r.estimatedRevenue) ?? 0));
        }
        for (const [k, v] of byKey) {
          const [day, content] = k.split("|");
          recs.push({ team_id: acc.team_id, platform: "youtube", day, content, revenue: v, currency, updated_at: now });
        }
      } catch {}
      if (recs.length) {
        try {
          // Before migration 0081 there's no CPM & co., before 0061 no streams: then without them.
          rows += await upsertSome(admin, "analytics_revenue_daily", recs, "team_id,platform,day,content", ["cpm", "playback_cpm", "ad_impressions", "monetized_playbacks"]);
        } catch (e) {
          if (!/ad_revenue|premium_revenue|gross_revenue|column/i.test(e instanceof Error ? e.message : "")) throw e;
          rows += await upsert(admin, "analytics_revenue_daily", recs.map(({ team_id, platform, day, content, revenue, currency, updated_at }) => ({ team_id, platform, day, content, revenue, currency, updated_at })), "team_id,platform,day,content");
        }
      }
    } catch (e) {
      revenueNote = e instanceof Error ? `Revenue: ${e.message}` : "Revenue isn't available for this channel.";
    }
  } else revenueNote = "Reconnect YouTube to include revenue.";

  // Advanced (0081), while there's time: how views split per day, the
  // windows (age & gender, search terms…), each video's retention and own
  // traffic, each video's money.
  const left = () => Date.now() < adv.deadline;
  if (left()) rows += await youtubeDailySplits(adv, token, start, daysAgo(1)).catch(() => 0);
  if (left()) rows += await youtubeWindows(adv, token, daysAgo(1)).catch(() => 0);
  if (left()) rows += await youtubeVideoDetails(adv, token, videos, backfill ? 10 : 6).catch(() => 0);
  if (left() && monetary && videos.length) rows += await youtubeVideoRevenue(adv, token, videos.map((v) => v.id), currency).catch(() => 0);
  return { rows, revenueNote, note: countryError ? `countries: ${countryError}` : null };
}

type YtVideo = { id: string; snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: Record<string, string>; contentDetails?: { duration?: string } };

/** Videos' titles, pictures and lifetime counts (Data API), at most 50 per call. */
async function ytVideos(token: string, ids: string[]): Promise<YtVideo[]> {
  const out: YtVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = (await get(`${YT}/videos?${new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(","), maxResults: "50" })}`, token)) as { items?: YtVideo[] };
    out.push(...(r.items ?? []));
  }
  return out;
}

function ytContentRow(acc: Account, v: YtVideo, links: Links) {
  const link = links.byExternal.get(`youtube:${v.id}`) ?? links.byUrl(v.id);
  const secs = isoDuration(v.contentDetails?.duration);
  return {
    team_id: acc.team_id,
    platform: "youtube",
    external_id: v.id,
    kind: link?.short ? "short" : link?.project ? "long" : secs !== null && secs <= 180 ? "short" : "long",
    title: v.snippet?.title ?? null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail_url: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
    published_at: v.snippet?.publishedAt ?? null,
    duration_seconds: secs,
    views: num(v.statistics?.viewCount),
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
    short_id: link?.short ?? null,
    project_id: link?.project ?? null,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>;
}

/**
 * Each video's lifetime analytics (YouTube Analytics API): engaged views,
 * watch time, average view duration, average % viewed, subscribers gained.
 * Null when YouTube won't give them (they're optional).
 */
async function ytVideoStats(token: string, ids: string[]): Promise<Map<string, Record<string, number | null>> | null> {
  if (!ids.length) return new Map();
  for (const metrics of ["views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained", "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained"]) {
    try {
      const out = new Map<string, Record<string, number | null>>();
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const list = rowsOf(await ytReport(token, { startDate: "2005-04-23", endDate: daysAgo(0), dimensions: "video", metrics, filters: `video==${chunk.join(",")}`, sort: "-views", maxResults: "50" }));
        for (const r of list)
          out.set(String(r.video), {
            engaged_views: metrics.includes("engagedViews") ? num(r.engagedViews) : null,
            watch_minutes: num(r.estimatedMinutesWatched),
            avg_view_seconds: num(r.averageViewDuration),
            avg_view_pct: num(r.averageViewPercentage),
            subscribers_gained: num(r.subscribersGained),
          });
      }
      return out;
    } catch {
      /* the shorter list, then without */
    }
  }
  return null;
}

async function syncYouTubeVideos(admin: Admin, acc: Account, token: string, uploads: string, links: Links): Promise<{ rows: number; videos: { id: string; publishedAt: string | null }[] }> {
  const items = (await get(`${YT}/playlistItems?${new URLSearchParams({ part: "contentDetails", playlistId: uploads, maxResults: "50" })}`, token)) as { items?: { contentDetails?: { videoId?: string } }[] };
  const ids = (items.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => !!x);
  if (!ids.length) return { rows: 0, videos: [] };
  const [vids, stats, extras] = await Promise.all([
    ytVideos(token, ids),
    ytVideoStats(token, ids),
    // Shares, dislikes, subscribers lost, playlists, Premium views, cards (0081).
    youtubeVideoExtras(token, ids).catch(() => new Map<string, Record<string, number | null>>()),
  ]);
  const recs = vids.map((v) => {
    const row = ytContentRow(acc, v, links);
    // Only when YouTube shared them this time (never blank yesterday's numbers).
    if (stats) Object.assign(row, stats.get(v.id) ?? { engaged_views: null, watch_minutes: null, avg_view_seconds: null, avg_view_pct: null, subscribers_gained: null });
    const x = extras.get(v.id);
    if (x) {
      // The Data API has no shares; the Analytics API does.
      if (x.shares !== null && x.shares !== undefined) row.shares = x.shares;
      row.metrics = Object.fromEntries(Object.entries(x).filter(([k]) => k !== "shares"));
    }
    return row;
  });
  const saved = await keepStoredMetrics(admin, "analytics_content", acc.team_id, "youtube", recs);
  return {
    rows: await upsertSome(admin, "analytics_content", saved, "team_id,platform,external_id", NEW_CONTENT_COLS),
    videos: vids.map((v) => ({ id: v.id, publishedAt: v.snippet?.publishedAt ?? null })),
  };
}

/**
 * The videos that got views on each of these days, with their views that
 * day (YouTube's top 50 per day), into analytics_content_days. Videos that
 * aren't listed yet (an older upload getting views again) are added with
 * their titles and pictures.
 */
async function syncYouTubeVideoDays(admin: Admin, acc: Account, token: string, days: string[], links: Links) {
  const now = new Date().toISOString();
  const recs: Record<string, unknown>[] = [];
  let failures = 0;
  // A few days at a time (one report per day).
  for (let i = 0; i < days.length && failures < 3; i += 4) {
    const batch = await Promise.all(
      days.slice(i, i + 4).map(async (day) => {
        try {
          return { day, list: rowsOf(await ytReport(token, { startDate: day, endDate: day, dimensions: "video", metrics: "views,estimatedMinutesWatched,likes,comments,shares", sort: "-views", maxResults: "50" })) };
        } catch {
          return { day, list: null };
        }
      })
    );
    for (const { day, list } of batch) {
      if (!list) {
        failures++;
        continue;
      }
      failures = 0;
      for (const r of list) {
        const id = String(r.video ?? "");
        if (!id || !(num(r.views) ?? 0)) continue;
        recs.push({ team_id: acc.team_id, platform: "youtube", external_id: id, day, source: "daily", views: num(r.views), watch_minutes: num(r.estimatedMinutesWatched), likes: num(r.likes), comments: num(r.comments), shares: num(r.shares), updated_at: now });
      }
    }
  }
  if (!recs.length) return 0;
  let rows = 0;
  try {
    rows += await upsert(admin, "analytics_content_days", recs, "team_id,platform,external_id,day");
  } catch {
    return 0; // Before migration 0079.
  }
  try {
    const ids = [...new Set(recs.map((r) => r.external_id as string))];
    const { data: known } = await admin.from("analytics_content").select("external_id").eq("team_id", acc.team_id).eq("platform", "youtube").in("external_id", ids);
    const have = new Set(((known ?? []) as { external_id: string }[]).map((k) => k.external_id));
    const missing = ids.filter((id) => !have.has(id)).slice(0, 100);
    if (missing.length) rows += await upsert(admin, "analytics_content", (await ytVideos(token, missing)).map((v) => ytContentRow(acc, v, links)), "team_id,platform,external_id");
  } catch {}
  return rows;
}

/**
 * Videos' own day-by-day numbers on demand (a video's analytics page,
 * 1.17.0): one report per video, day by day from `from` to `to`, into
 * analytics_content_days (source "daily"). Days without views between the
 * first and the last day YouTube answered for are saved as 0, so the page
 * knows the history is whole. Returns the rows saved, or -1 when there's no
 * YouTube account (of this team's numbers) to ask.
 */
export async function fetchYouTubeVideoHistory(teamId: string, items: { id: string; from: string; to: string }[], budgetMs = 9_000): Promise<number> {
  if (!items.length) return 0;
  const admin = createAdminClient();
  const { data: acc } = await admin.from("social_accounts").select("id, team_id, platform, external_id, scopes, username, display_name").eq("team_id", teamId).eq("platform", "youtube").eq("status", "active").maybeSingle();
  if (!acc || !hasStatsScopes("youtube", (acc.scopes as string[] | null) ?? [])) return -1;
  const { data: s } = await admin.from("analytics_syncs").select("account_ref").eq("team_id", teamId).eq("platform", "youtube").maybeSingle();
  if (s && !sameAccount((s as { account_ref?: string | null }).account_ref ?? null, { externalId: acc.external_id as string, name: ((acc.username as string | null) ?? (acc.display_name as string | null)) ?? null })) return -1;
  const token = await getAccessToken(acc.id as string);
  const deadline = Date.now() + budgetMs;
  const now = new Date().toISOString();
  let saved = 0;
  for (let i = 0; i < items.length && Date.now() < deadline; i += 3) {
    const batch = await Promise.all(
      items.slice(i, i + 3).map(async (it) => {
        const r = await ytFirst(token, { startDate: it.from, endDate: it.to, dimensions: "day", filters: `video==${it.id}`, sort: "day" }, ["views,estimatedMinutesWatched,likes,comments,shares", "views,estimatedMinutesWatched", "views"]);
        return { it, r };
      })
    );
    const recs: Record<string, unknown>[] = [];
    for (const { it, r } of batch) {
      if (!r?.rows.length) continue;
      const has = new Set(r.metrics.split(","));
      const got = new Map(r.rows.map((x) => [String(x.day), x]));
      const days = [...got.keys()].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      if (!days.length) continue;
      for (const day of dayRange(days[0], days[days.length - 1])) {
        const x = got.get(day);
        const val = (metric: string, col: string) => (has.has(metric) ? (x ? num(x[metric]) ?? 0 : 0) : null) ?? (col === "views" ? 0 : null);
        recs.push({
          team_id: teamId,
          platform: "youtube",
          external_id: it.id,
          day,
          source: "daily",
          views: val("views", "views"),
          watch_minutes: val("estimatedMinutesWatched", "watch_minutes"),
          likes: val("likes", "likes"),
          comments: val("comments", "comments"),
          shares: val("shares", "shares"),
          updated_at: now,
        });
      }
    }
    if (recs.length) saved += await upsert(admin, "analytics_content_days", recs, "team_id,platform,external_id,day");
  }
  return saved;
}

/**
 * One day's videos on demand (a day clicked on the chart that the daily copy
 * didn't keep): YouTube only (the others only share totals, kept from each
 * copy on). Returns false when there's no YouTube account to ask.
 */
export async function fetchYouTubeDay(teamId: string, day: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: acc } = await admin.from("social_accounts").select("id, team_id, platform, external_id, scopes, username, display_name").eq("team_id", teamId).eq("platform", "youtube").eq("status", "active").maybeSingle();
  if (!acc || !hasStatsScopes("youtube", (acc.scopes as string[] | null) ?? [])) return false;
  // Only into numbers that are this account's.
  const { data: s } = await admin.from("analytics_syncs").select("account_ref").eq("team_id", teamId).eq("platform", "youtube").maybeSingle();
  if (s && !sameAccount((s as { account_ref?: string | null }).account_ref ?? null, { externalId: acc.external_id as string, name: ((acc.username as string | null) ?? (acc.display_name as string | null)) ?? null })) return false;
  const token = await getAccessToken(acc.id as string);
  await syncYouTubeVideoDays(admin, acc as Account, token, [day], await linksFor(admin, teamId));
  return true;
}

// ---------------------------------------------------------------------------
// Instagram (Instagram API with Instagram Login)
// ---------------------------------------------------------------------------

const IG = () => `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_VERSION || "v23.0"}`;
const unix = (day: string, end = false) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) + (end ? 86_400 : 0);

async function syncInstagram(admin: Admin, acc: Account, backfill: boolean, links: Links, adv: Advanced) {
  const token = await getAccessToken(acc.id);
  const igId = acc.external_id ?? "me";
  const q = (path: string, p: Record<string, string>) => get(`${IG()}/${path}?${new URLSearchParams({ ...p, access_token: token })}`, "");
  let rows = 0;
  const daily = new Map<string, Record<string, unknown>>();
  const put = (day: string, v: Record<string, unknown>) =>
    daily.set(day, { ...(daily.get(day) ?? { team_id: acc.team_id, platform: "instagram", day, content: "all" }), ...v, updated_at: new Date().toISOString() });

  // Per-day totals (views, likes, comments, shares, saves, reach; and from
  // 0081 interactions, accounts engaged, replies, reposts, profile link
  // taps). One call per day. If Instagram refuses a metric, a shorter list.
  const METRIC_SETS = [
    "views,likes,comments,shares,saves,total_interactions,reach,accounts_engaged,replies,reposts,profile_links_taps",
    "views,likes,comments,shares,saves,total_interactions,reach",
    "views,likes,comments,shares",
    "views",
  ];
  const EXTRA: Record<string, string> = { total_interactions: "interactions", accounts_engaged: "accounts_engaged", replies: "replies", reposts: "reposts", profile_links_taps: "profile_link_taps" };
  let set = 0;
  for (const day of dayRange(backfill ? daysAgo(28) : daysAgo(3), daysAgo(1)).reverse()) {
    try {
      type Insights = { data?: { name: string; total_value?: { value?: number } }[] };
      let r: Insights | null = null;
      while (!r) {
        try {
          r = (await q(`${igId}/insights`, { metric: METRIC_SETS[set], period: "day", metric_type: "total_value", since: String(unix(day)), until: String(unix(day, true)) })) as Insights;
        } catch (e) {
          if (e instanceof ApiError && e.status === 400 && set < METRIC_SETS.length - 1) set++;
          else throw e;
        }
      }
      const v: Record<string, unknown> = {};
      const metrics: Record<string, number | null> = {};
      for (const m of r.data ?? []) {
        const val = num(m.total_value?.value);
        if (m.name === "views") v.views = val;
        else if (m.name === "likes") v.likes = val;
        else if (m.name === "comments") v.comments = val;
        else if (m.name === "shares") v.shares = val;
        else if (m.name === "saves") v.saves = val;
        else if (m.name === "reach") v.reach = val;
        else if (EXTRA[m.name]) metrics[EXTRA[m.name]] = val;
      }
      if (Object.keys(metrics).length) v.metrics = metrics;
      put(day, v);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) throw e;
      break;
    }
  }

  // Followers right now.
  try {
    const me = (await q(igId, { fields: "followers_count,media_count" })) as Record<string, unknown>;
    put(daysAgo(0), { followers: num(me.followers_count) });
  } catch {}
  rows += await upsertSome(admin, "analytics_daily", await keepStoredMetrics(admin, "analytics_daily", acc.team_id, "instagram", [...daily.values()]), "team_id,platform,day,content", NEW_DAILY_COLS);

  // Followers by country (a snapshot, for the map).
  try {
    const r = (await q(`${igId}/insights`, { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: "country" })) as {
      data?: { total_value?: { breakdowns?: { results?: { dimension_values?: string[]; value?: number }[] }[] } }[];
    };
    const results = r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    const today = daysAgo(0);
    const recs = results
      .filter((x) => /^[A-Z]{2}$/.test(String(x.dimension_values?.[0])))
      .map((x) => ({ team_id: acc.team_id, platform: "instagram", metric: "followers", day: today, country: String(x.dimension_values![0]), value: num(x.value) ?? 0 }));
    if (recs.length) rows += await upsert(admin, "analytics_countries", recs, "team_id,platform,metric,day,country");
  } catch {}

  // Recent posts with their numbers.
  try {
    const media = (await q(`${igId}/media`, { fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count", limit: "25" })) as {
      data?: { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; thumbnail_url?: string; media_url?: string; timestamp?: string; like_count?: number; comments_count?: number }[];
    };
    const recs: Record<string, unknown>[] = [];
    // Reels' watch time, skip rate and reposts (0079), then total watch time,
    // interactions and views from Facebook (0081): asked once with all of
    // them, then without the ones Instagram refuses for this account.
    let reelSet = 0;
    const REEL_SETS = [
      "ig_reels_avg_watch_time,reels_skip_rate,reposts,ig_reels_video_view_total_time,total_interactions,crossposted_views,facebook_views",
      "ig_reels_avg_watch_time,reels_skip_rate,reposts,ig_reels_video_view_total_time,total_interactions",
      "ig_reels_avg_watch_time,reels_skip_rate,reposts",
      "ig_reels_avg_watch_time,reels_skip_rate",
      "ig_reels_avg_watch_time",
    ];
    for (const m of media.data ?? []) {
      const link = links.byExternal.get(`instagram:${m.id}`) ?? (m.permalink ? links.byUrl(m.permalink) : null);
      let views: number | null = null;
      let reach: number | null = null;
      let shares: number | null = null;
      let saves: number | null = null;
      const reel: Record<string, unknown> = {};
      const metrics: Record<string, number | null> = {};
      try {
        const ins = (await q(`${m.id}/insights`, { metric: "views,reach,shares,saved" })) as { data?: { name: string; values?: { value?: number }[] }[] };
        for (const x of ins.data ?? []) {
          const val = num(x.values?.[0]?.value);
          if (x.name === "views") views = val;
          else if (x.name === "reach") reach = val;
          else if (x.name === "shares") shares = val;
          else if (x.name === "saved") saves = val;
        }
      } catch {}
      if (m.media_product_type === "REELS" && reelSet < REEL_SETS.length) {
        while (reelSet < REEL_SETS.length) {
          try {
            const ins = (await q(`${m.id}/insights`, { metric: REEL_SETS[reelSet] })) as { data?: { name: string; values?: { value?: number }[] }[] };
            for (const x of ins.data ?? []) {
              const val = num(x.values?.[0]?.value);
              // Watch times come in milliseconds; the skip rate as a percentage.
              if (x.name === "ig_reels_avg_watch_time") reel.avg_view_seconds = val === null ? null : Math.round(val / 100) / 10;
              else if (x.name === "reels_skip_rate") reel.skip_rate = val === null ? null : Math.round(val * 100) / 100;
              else if (x.name === "reposts") reel.reposts = val;
              else if (x.name === "ig_reels_video_view_total_time") metrics.total_watch_seconds = val === null ? null : Math.round(val / 1000);
              else if (x.name === "total_interactions") metrics.interactions = val;
              else if (x.name === "crossposted_views") metrics.crossposted_views = val;
              else if (x.name === "facebook_views") metrics.facebook_views = val;
            }
            break;
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) break;
            reelSet++;
          }
        }
      }
      recs.push({
        ...reel,
        ...(Object.keys(metrics).length ? { metrics } : {}),
        team_id: acc.team_id,
        platform: "instagram",
        external_id: m.id,
        kind: link?.short ? "short" : link?.project ? "long" : m.media_product_type === "REELS" ? "short" : "post",
        title: (m.caption ?? "").split("\n")[0].slice(0, 200) || null,
        url: m.permalink ?? null,
        thumbnail_url: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url ?? null : null),
        published_at: m.timestamp ?? null,
        views,
        likes: num(m.like_count),
        comments: num(m.comments_count),
        shares,
        saves,
        reach,
        short_id: link?.short ?? null,
        project_id: link?.project ?? null,
        updated_at: new Date().toISOString(),
      });
    }
    rows += await upsertSome(admin, "analytics_content", await keepStoredMetrics(admin, "analytics_content", acc.team_id, "instagram", recs), "team_id,platform,external_id", NEW_CONTENT_COLS);
    rows += await snapshotContent(admin, acc.team_id, "instagram", recs);
  } catch {}

  // Advanced (0081), while there's time: followers vs others, kinds of
  // posts, follows, and who the audience is.
  if (Date.now() < adv.deadline) rows += await instagramWindows(adv, q, igId, daysAgo(1)).catch(() => 0);
  return { rows };
}

// ---------------------------------------------------------------------------
// TikTok (Display API: account totals + public videos; no per-day history,
// so we keep a daily snapshot and the page works out the change per day)
// ---------------------------------------------------------------------------

async function syncTikTok(admin: Admin, acc: Account, links: Links) {
  const token = await getAccessToken(acc.id);
  let rows = 0;
  const today = daysAgo(0);
  const user = (await get("https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count", token)) as { data?: { user?: Record<string, unknown> } };
  const u = user.data?.user ?? {};
  let totalViews = 0;
  let totalLikes = 0;
  const recs: Record<string, unknown>[] = [];
  let cursor: number | null = null;
  for (let page = 0; page < 10; page++) {
    const r = (await get(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,view_count,like_count,comment_count,share_count,cover_image_url,share_url,duration",
      token,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) }
    )) as { data?: { videos?: Record<string, unknown>[]; cursor?: number; has_more?: boolean } };
    for (const v of r.data?.videos ?? []) {
      const id = String(v.id);
      totalViews += num(v.view_count) ?? 0;
      totalLikes += num(v.like_count) ?? 0;
      const link = links.byExternal.get(`tiktok:${id}`) ?? links.byUrl(id);
      recs.push({
        team_id: acc.team_id,
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
        updated_at: new Date().toISOString(),
      });
    }
    if (!r.data?.has_more || !r.data.cursor) break;
    cursor = r.data.cursor;
  }
  rows += await upsert(admin, "analytics_content", recs, "team_id,platform,external_id");
  rows += await snapshotContent(admin, acc.team_id, "tiktok", recs);
  rows += await upsert(
    admin,
    "analytics_daily",
    [{ team_id: acc.team_id, platform: "tiktok", day: today, content: "all", followers: num(u.follower_count), total_views: totalViews, total_likes: num(u.likes_count) ?? totalLikes, updated_at: new Date().toISOString() }],
    "team_id,platform,day,content"
  );
  // TikTok only gives running totals: daily numbers start once there are two copies.
  const videos = recs.length;
  return { rows, note: `${videos} video${videos === 1 ? "" : "s"}${num(u.follower_count) !== null ? `, ${num(u.follower_count)} followers` : ""}${videos ? "" : " (TikTok returned no public videos)"}` };
}

// ---------------------------------------------------------------------------
// Facebook (a Page)
// ---------------------------------------------------------------------------

/** Facebook's daily values end at midnight Pacific: the value belongs to the day before end_time. */
const fbDay = (endTime: string) => new Date(Date.parse(endTime) - 12 * 3_600_000).toISOString().slice(0, 10);

async function syncFacebook(admin: Admin, acc: Account, backfill: boolean, links: Links, adv: Advanced) {
  const token = await getAccessToken(acc.id);
  const pageId = acc.external_id ?? "me";
  const q = (path: string, p: Record<string, string>) => get(`${FB_GRAPH()}/${path}?${new URLSearchParams({ ...p, access_token: token })}`, "");
  let rows = 0;
  const daily = new Map<string, Record<string, unknown>>();
  const put = (day: string, v: Record<string, unknown>) =>
    daily.set(day, { ...(daily.get(day) ?? { team_id: acc.team_id, platform: "facebook", day, content: "all" }), ...v, updated_at: new Date().toISOString() });

  // One metric per call, so a metric Meta retires never blanks the others.
  // page_media_view replaced impressions (Nov 2025); page fans are gone (followers_count instead).
  const since = String(Math.floor(Date.parse(`${daysAgo(backfill ? 89 : 7)}T00:00:00Z`) / 1000));
  const until = String(Math.floor(Date.now() / 1000));
  const METRICS: [string, string][] = [
    ["page_media_view", "views"],
    ["page_post_engagements", "engagements"],
    ["page_daily_follows_unique", "followers_gained"],
    ["page_daily_unfollows_unique", "followers_lost"],
    ["page_video_views", "video_views"],
  ];
  let ok = 0;
  const failed: string[] = [];
  const videoViews = new Map<string, number>();
  for (const [metric, field] of METRICS) {
    try {
      const r = (await q(`${pageId}/insights`, { metric, period: "day", since, until })) as { data?: { values?: { value: unknown; end_time: string }[] }[] };
      for (const v of r.data?.[0]?.values ?? []) {
        const value = typeof v.value === "number" ? v.value : num(v.value);
        if (value === null) continue;
        if (field === "video_views") videoViews.set(fbDay(v.end_time), value);
        else put(fbDay(v.end_time), { [field]: value });
      }
      ok++;
    } catch {
      failed.push(metric);
    }
  }
  // Pages with mostly video: if media views were refused, video views stand in.
  for (const [day, v] of videoViews) if (daily.get(day)?.views === undefined) put(day, { views: v });

  // More per day (0081), one per call too (a retired one just stays empty):
  // minutes of video watched, 30-second views, people reached, Page visits.
  const EXTRA: [string, string, (v: number) => number][] = [
    ["page_video_view_time", "video_watch_minutes", (v) => Math.round(v / 6000) / 10],
    ["page_video_complete_views_30s", "complete_views_30s", (v) => v],
    ["page_total_media_view_unique", "reach", (v) => v],
    ["page_views_total", "page_visits", (v) => v],
  ];
  if (Date.now() < adv.deadline) {
    const extras = new Map<string, Record<string, number>>();
    await Promise.all(
      EXTRA.map(async ([metric, key, conv]) => {
        try {
          const r = (await q(`${pageId}/insights`, { metric, period: "day", since, until })) as { data?: { values?: { value: unknown; end_time: string }[] }[] };
          for (const v of r.data?.[0]?.values ?? []) {
            const value = num(v.value);
            if (value === null) continue;
            const day = fbDay(v.end_time);
            extras.set(day, { ...(extras.get(day) ?? {}), [key]: conv(value) });
          }
        } catch {}
      })
    );
    for (const [day, m] of extras) {
      const { reach, ...rest } = m;
      put(day, { ...(reach !== undefined ? { reach } : {}), ...(Object.keys(rest).length ? { metrics: rest } : {}) });
    }
  }

  // Earnings, for a Page in Facebook's Content Monetization (Graph API v23+):
  // one amount per day, into Revenue next to YouTube's. Pages that aren't
  // monetized get none (or zeros), and the sync note says so.
  const earnings = await facebookEarnings(q, { pageId, since, until, currency: (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase(), dayOf: fbDay });
  let revenueNote = earnings.note;
  const earningDays = earnings.days.length;
  const earned = earnings.days.reduce((t, d) => t + d.amount, 0);
  if (earningDays) {
    const now = new Date().toISOString();
    try {
      rows += await upsert(
        admin,
        "analytics_revenue_daily",
        earnings.days.map((d) => ({ team_id: acc.team_id, platform: "facebook", day: d.day, content: "all", revenue: d.amount, currency: d.currency, updated_at: now })),
        "team_id,platform,day,content"
      );
    } catch (e) {
      revenueNote = /check constraint/i.test(e instanceof Error ? e.message : "") ? "Facebook earnings need database migration 0074." : `Facebook earnings: ${e instanceof Error ? e.message : "couldn't be saved"}`;
    }
  }

  // Followers right now (on today's row, like the other snapshots).
  try {
    const page = (await q(pageId, { fields: "followers_count,fan_count" })) as { followers_count?: number; fan_count?: number };
    const f = num(page.followers_count) ?? num(page.fan_count);
    if (f !== null) put(daysAgo(0), { followers: f });
  } catch {}
  rows += await upsertSome(admin, "analytics_daily", await keepStoredMetrics(admin, "analytics_daily", acc.team_id, "facebook", [...daily.values()]), "team_id,platform,day,content", NEW_DAILY_COLS);

  // Followers by country (the latest snapshot), for the audience map. Meta
  // renamed page_fans_country to page_follows_country; try the new one first.
  let countries = 0;
  for (const metric of ["page_follows_country", "page_fans_country"]) {
    try {
      const r = (await q(`${pageId}/insights`, { metric })) as { data?: { values?: { value: unknown; end_time: string }[] }[] };
      const values = (r.data ?? []).flatMap((d) => d.values ?? []).filter((v) => v.value && typeof v.value === "object");
      const last = values[values.length - 1];
      if (!last) continue;
      const today = daysAgo(0);
      const recs = Object.entries(last.value as Record<string, unknown>)
        .filter(([code]) => /^[A-Z]{2}$/.test(code))
        .map(([code, v]) => ({ team_id: acc.team_id, platform: "facebook", metric: "followers", day: today, country: code, value: num(v) ?? 0 }))
        .filter((x) => x.value > 0);
      if (!recs.length) continue;
      rows += await upsert(admin, "analytics_countries", recs, "team_id,platform,metric,day,country");
      countries = recs.length;
      break;
    } catch {
      /* not shared for this Page: the map just has no Facebook layer */
    }
  }

  // Posts with their numbers (views per post when Meta allows it; else without).
  const fields = "id,message,created_time,permalink_url,full_picture,shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)";
  let posts: Record<string, unknown>[] = [];
  try {
    posts = (((await q(`${pageId}/published_posts`, { fields: `${fields},insights.metric(post_media_view)`, limit: "25" })) as { data?: Record<string, unknown>[] }).data ?? []);
  } catch {
    try {
      posts = (((await q(`${pageId}/published_posts`, { fields, limit: "25" })) as { data?: Record<string, unknown>[] }).data ?? []);
    } catch {}
  }
  const recs: Record<string, unknown>[] = posts.map((m) => {
    const id = String(m.id);
    const permalink = (m.permalink_url as string | undefined) ?? null;
    const link = links.byExternal.get(`facebook:${id}`) ?? (permalink ? links.byUrl(permalink) : null);
    const insight = ((m.insights as { data?: { name: string; values?: { value: unknown }[] }[] } | undefined)?.data ?? []).find((x) => x.name === "post_media_view");
    return {
      team_id: acc.team_id,
      platform: "facebook",
      external_id: id,
      kind: link?.project ? "long" : link?.short ? "short" : "post",
      title: String(m.message ?? "").split("\n")[0].slice(0, 200) || null,
      url: permalink,
      thumbnail_url: (m.full_picture as string | undefined) ?? null,
      published_at: (m.created_time as string | undefined) ? new Date(m.created_time as string).toISOString() : null,
      views: insight ? num(insight.values?.[0]?.value) : null,
      likes: num((m.reactions as { summary?: { total_count?: number } } | undefined)?.summary?.total_count),
      comments: num((m.comments as { summary?: { total_count?: number } } | undefined)?.summary?.total_count),
      shares: num((m.shares as { count?: number } | undefined)?.count) ?? 0,
      short_id: link?.short ?? null,
      project_id: link?.project ?? null,
      updated_at: new Date().toISOString(),
    };
  });
  // Reels (what ClipTroop posts to the Page) live apart from Page posts:
  // read them too, with plays and reactions when Meta shares them.
  let reels: Record<string, unknown>[] = [];
  try {
    reels = (((await q(`${pageId}/video_reels`, { fields: "id,description,created_time,permalink_url,picture", limit: "25" })) as { data?: Record<string, unknown>[] }).data ?? []);
  } catch {
    /* no Reels edge for this Page: Page posts only */
  }
  const postLinks = posts.map((m) => String(m.permalink_url ?? ""));
  const total = (v: unknown) =>
    v && typeof v === "object" ? Object.values(v as Record<string, unknown>).reduce<number>((t, x) => t + (num(x) ?? 0), 0) : num(v);
  const part = (v: unknown, key: string) =>
    v && typeof v === "object" ? num(Object.entries(v as Record<string, unknown>).find(([k]) => k.toLowerCase() === key)?.[1]) : null;
  // Each Reel's numbers, 5 at a time: plays, reactions, comments, shares;
  // from 0081 also total plays and replays, people reached, average and
  // total watch time, followers gained, the reactions by kind, and its
  // retention curve. The longer list first, then the original one.
  const REEL_METRICS = [
    "blue_reels_play_count,post_video_likes_by_reaction_type,post_video_social_actions,fb_reels_total_plays,fb_reels_replay_count,post_impressions_unique,post_video_avg_time_watched,post_video_view_time,post_video_followers",
    "blue_reels_play_count,post_video_likes_by_reaction_type,post_video_social_actions",
  ];
  let reelSet = 0;
  const reelCurves: { id: string; points: RetentionPoint[] }[] = [];
  const fresh = reels.filter((m) => !postLinks.some((u) => u.includes(String(m.id))));
  const reelCount = fresh.length;
  for (let i = 0; i < fresh.length; i += 5) {
    const batch = await Promise.all(
      fresh.slice(i, i + 5).map(async (m) => {
        const id = String(m.id);
        const out = { views: null as number | null, likes: null as number | null, comments: null as number | null, shares: null as number | null, avg: null as number | null, metrics: {} as Record<string, unknown> };
        for (;;) {
          const used = reelSet;
          try {
            const ins = (await q(`${id}/video_insights`, { metric: REEL_METRICS[used], period: "lifetime" })) as { data?: { name: string; values?: { value: unknown }[] }[] };
            for (const d of ins.data ?? []) {
              const v = d.values?.[0]?.value;
              if (d.name === "blue_reels_play_count") out.views = num(v);
              else if (d.name === "post_video_likes_by_reaction_type") {
                out.likes = total(v);
                if (v && typeof v === "object") out.metrics.reactions = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k.toLowerCase(), num(x)]));
              } else if (d.name === "post_video_social_actions") {
                out.comments = part(v, "comment");
                out.shares = part(v, "share");
              } else if (d.name === "fb_reels_total_plays") out.metrics.total_plays = num(v);
              else if (d.name === "fb_reels_replay_count") out.metrics.replays = num(v);
              else if (d.name === "post_impressions_unique") out.metrics.reach = num(v);
              // Milliseconds.
              else if (d.name === "post_video_avg_time_watched") out.avg = num(v) === null ? null : Math.round(num(v)! / 100) / 10;
              else if (d.name === "post_video_view_time") out.metrics.total_watch_seconds = num(v) === null ? null : Math.round(num(v)! / 1000);
              else if (d.name === "post_video_followers") out.metrics.followers_gained = num(v);
            }
            break;
          } catch (e) {
            // A refused list → the shorter one (for the other Reels too). Otherwise
            // this Reel's numbers aren't shared: it's listed without them.
            if (e instanceof ApiError && e.status === 400 && /metric/i.test(e.message) && used < REEL_METRICS.length - 1) {
              if (reelSet === used) reelSet++;
              continue;
            }
            break;
          }
        }
        if (Date.now() < adv.deadline) {
          try {
            const r = (await q(`${id}/video_insights`, { metric: "post_video_retention_graph", period: "lifetime" })) as { data?: { name: string; values?: { value: unknown }[] }[] };
            const points = facebookRetention(r.data?.[0]?.values?.[0]?.value);
            if (points.length) reelCurves.push({ id, points });
          } catch {}
        }
        return { m, id, ...out };
      })
    );
    for (const { m, id, views, likes, comments, shares, avg, metrics } of batch) {
      const raw = (m.permalink_url as string | undefined) ?? "";
      const permalink = raw ? (raw.startsWith("http") ? raw : `https://www.facebook.com${raw.startsWith("/") ? "" : "/"}${raw}`) : `https://www.facebook.com/reel/${id}`;
      const link = links.byExternal.get(`facebook:${id}`) ?? links.byUrl(id);
      recs.push({
        team_id: acc.team_id,
        platform: "facebook",
        external_id: id,
        kind: link?.project ? "long" : "short",
        title: String(m.description ?? "").split("\n")[0].slice(0, 200) || null,
        url: permalink,
        thumbnail_url: (m.picture as string | undefined) ?? null,
        published_at: (m.created_time as string | undefined) ? new Date(m.created_time as string).toISOString() : null,
        views,
        likes,
        comments,
        shares: shares ?? 0,
        ...(avg !== null ? { avg_view_seconds: avg } : {}),
        ...(Object.keys(metrics).length ? { metrics } : {}),
        short_id: link?.short ?? null,
        project_id: link?.project ?? null,
        updated_at: new Date().toISOString(),
      });
    }
  }
  if (reelCurves.length) {
    const now = new Date().toISOString();
    try {
      rows += await upsert(admin, "analytics_retention", reelCurves.map((c) => ({ team_id: acc.team_id, platform: "facebook", external_id: c.id, points: c.points, updated_at: now })), "team_id,platform,external_id");
    } catch {}
  }
  rows += await upsertSome(admin, "analytics_content", await keepStoredMetrics(admin, "analytics_content", acc.team_id, "facebook", recs), "team_id,platform,external_id", NEW_CONTENT_COLS);
  rows += await snapshotContent(admin, acc.team_id, "facebook", recs);
  if (!ok) throw new ApiError(`Facebook refused every Page metric${failed.length ? ` (${failed[0]})` : ""}. Check the Page permissions (read_insights).`);
  return {
    rows,
    revenueNote,
    note: `${ok} of ${METRICS.length} metrics, ${recs.length - reelCount} posts${reelCount ? `, ${reelCount} Reels` : ""}${countries ? `, ${countries} countries` : ""}${earningDays ? `, earnings on ${earningDays} days (${earned.toFixed(2)})` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// Linking platform videos to our shorts / long videos
// ---------------------------------------------------------------------------

type Link = { short?: string; project?: string };
type Links = { byExternal: Map<string, Link>; byUrl: (needle: string) => Link | null };

async function linksFor(admin: Admin, teamId: string): Promise<Links> {
  const [{ data: posts }, { data: shortPosts }, { data: longs }, { data: longPosts }] = await Promise.all([
    admin.from("social_posts").select("short_id, platform, external_id, permalink").eq("team_id", teamId).eq("status", "published"),
    admin.from("short_video_posts").select("short_id, platform, post_url, short_videos!inner(team_id)").eq("short_videos.team_id", teamId),
    admin.from("long_video_projects").select("id, youtube_video_id").eq("team_id", teamId),
    admin.from("long_video_posts").select("project_id, platform, url, long_video_projects!inner(team_id)").eq("long_video_projects.team_id", teamId),
  ]);
  const byExternal = new Map<string, Link>();
  const urls: { url: string; link: Link }[] = [];
  for (const p of posts ?? []) {
    if (p.external_id) byExternal.set(`${p.platform}:${p.external_id}`, { short: p.short_id as string });
    if (p.permalink) urls.push({ url: p.permalink as string, link: { short: p.short_id as string } });
  }
  for (const p of shortPosts ?? []) if (p.post_url) urls.push({ url: p.post_url as string, link: { short: p.short_id as string } });
  for (const l of longs ?? []) if (l.youtube_video_id) byExternal.set(`youtube:${l.youtube_video_id}`, { project: l.id as string });
  for (const p of longPosts ?? []) if (p.url) urls.push({ url: p.url as string, link: { project: p.project_id as string } });
  return {
    byExternal,
    // A video id (or permalink) that appears inside one of our saved links.
    byUrl: (needle: string) => (needle.length >= 6 ? urls.find((u) => u.url.includes(needle) || needle.includes(u.url))?.link ?? null : null),
  };
}

/**
 * Each video's running totals as of today's copy (Instagram, TikTok and
 * Facebook only share totals): what a video got on a day is the next day's
 * copy minus that day's. Optional (before migration 0079 there's no table).
 */
async function snapshotContent(admin: Admin, teamId: string, platform: SocialPlatform, recs: Record<string, unknown>[]) {
  const day = daysAgo(0);
  const now = new Date().toISOString();
  const snaps = recs
    .filter((r) => r.views !== null && r.views !== undefined)
    .map((r) => ({ team_id: teamId, platform, external_id: r.external_id, day, source: "total", views: r.views ?? null, likes: r.likes ?? null, comments: r.comments ?? null, shares: r.shares ?? null, updated_at: now }));
  if (!snaps.length) return 0;
  try {
    return await upsert(admin, "analytics_content_days", snaps, "team_id,platform,external_id,day");
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------

/** Copy one team's numbers from every connected platform that allows it. */
/**
 * Copies a team's numbers from its connected accounts. `only`: one platform
 * (the morning timer calls once per team and platform, 0082); `skipOkSince`:
 * leave out the platforms copied fine since then (the retry calls); `log`:
 * record each platform's run in job_runs (the timer's calls).
 */
export async function syncTeamAnalytics(teamId: string, o: { only?: SocialPlatform; skipOkSince?: number; log?: boolean } = {}): Promise<SyncResult[]> {
  const admin = createAdminClient();
  const { data: all } = await admin.from("social_accounts").select("id, team_id, platform, external_id, scopes, username, display_name").eq("team_id", teamId).eq("status", "active");
  const { data: syncs } = await admin.from("analytics_syncs").select("platform, backfilled, last_ok_at").eq("team_id", teamId);
  const okAt = new Map(((syncs ?? []) as { platform: string; last_ok_at: string | null }[]).map((s) => [s.platform, Date.parse(s.last_ok_at ?? "") || 0]));
  const accounts = ((all ?? []) as Account[]).filter((a) => (!o.only || a.platform === o.only) && (o.skipOkSince === undefined || (okAt.get(a.platform) ?? 0) < o.skipOkSince));
  if (!accounts.length) return [];
  const done = new Set((syncs ?? []).filter((s) => s.backfilled).map((s) => s.platform as string));
  const links = await linksFor(admin, teamId);
  const out: SyncResult[] = [];
  // The Advanced page's extra numbers (0081) only while the whole copy stays
  // short (Sync now waits for it; the morning job has other teams to do).
  const adv: Advanced = { admin, teamId, deadline: Date.now() + 30_000 };
  for (const a of accounts) {
    const run = o.log ? await jobStart(admin, "analytics", teamId, a.platform) : null;
    const before = out.length;
    // The numbers stored for this platform must be this account's: another
    // account's are deleted first, and this one's history is fetched again.
    let fresh = false;
    try {
      fresh = (await adoptAccount(admin, teamId, a.platform, { externalId: a.external_id ?? "", name: a.username ?? a.display_name ?? null })).purged;
    } catch {}
    if (!hasStatsScopes(a.platform, a.scopes ?? [])) {
      out.push({ platform: a.platform, ok: false, error: "Reconnect this account to allow stats.", rows: 0 });
      await admin.from("analytics_syncs").upsert({ team_id: teamId, platform: a.platform, last_run_at: new Date().toISOString(), last_error: "Reconnect this account to allow stats." }, { onConflict: "team_id,platform" });
      if (run !== null) await jobEnd(admin, run, false, "Reconnect this account to allow stats.");
      continue;
    }
    const backfill = fresh || !done.has(a.platform);
    try {
      let rows = 0;
      let revenueNote: string | null = null;
      let note: string | null = null;
      if (a.platform === "youtube") ({ rows, revenueNote, note } = await syncYouTube(admin, a, backfill, links, adv));
      else if (a.platform === "instagram") ({ rows } = await syncInstagram(admin, a, backfill, links, adv));
      else if (a.platform === "facebook") ({ rows, note, revenueNote } = await syncFacebook(admin, a, backfill, links, adv));
      else ({ rows, note } = await syncTikTok(admin, a, links));
      const now = new Date().toISOString();
      await admin.from("analytics_syncs").upsert({ team_id: teamId, platform: a.platform, last_run_at: now, last_ok_at: now, last_error: null, backfilled: true, revenue_note: revenueNote }, { onConflict: "team_id,platform" });
      out.push({ platform: a.platform, ok: true, rows, note });
    } catch (e) {
      const message = (e instanceof Error ? e.message : "Unknown error").slice(0, 300);
      await admin.from("analytics_syncs").upsert({ team_id: teamId, platform: a.platform, last_run_at: new Date().toISOString(), last_error: message }, { onConflict: "team_id,platform" });
      out.push({ platform: a.platform, ok: false, error: message, rows: 0 });
    }
    const r = out[before];
    if (run !== null) await jobEnd(admin, run, !!r?.ok, r ? (r.ok ? `${r.rows} rows${r.note ? ` (${r.note})` : ""}` : r.error ?? "Failed") : "Skipped");
  }
  // New numbers can finish a views / followers objective (yesterday's numbers arrive this morning).
  if (out.some((r) => r.ok)) {
    try {
      await syncObjectives(teamId, { change: "numbers" });
    } catch (e) {
      console.error("[objectives] after analytics", e instanceof Error ? e.message : e);
    }
  }
  // Projections: today's value of each, a target reached, a deadline passed.
  try {
    const { recordProjections } = await import("@/modules/projections/lib/record");
    await recordProjections(teamId);
  } catch (e) {
    console.error("[projections] after analytics", e instanceof Error ? e.message : e);
  }
  return out;
}

/*
 * Catch-up. The numbers are copied automatically every morning (the daily
 * job below). If that didn't happen — the timer isn't set up, a platform was
 * down, the app was asleep — the first person to open Analytics after 30
 * hours starts a copy in the background, and their page refreshes when it's
 * done. Nobody has to press Sync now.
 */
const CATCH_UP_AFTER_HOURS = 30;
const recentCatchUps = new Map<string, number>();

/** Is this team's copy overdue? If so, claims it (so only one visitor starts one) and says yes. */
export async function claimAnalyticsCatchUp(teamId: string): Promise<boolean> {
  try {
    const now = Date.now();
    if ((recentCatchUps.get(teamId) ?? 0) > now - 10 * 60_000) return false;
    const admin = createAdminClient();
    const [{ data: accounts }, { data: syncs }] = await Promise.all([
      admin.from("social_accounts").select("platform, scopes").eq("team_id", teamId).eq("status", "active"),
      admin.from("analytics_syncs").select("platform, last_run_at").eq("team_id", teamId),
    ]);
    const counted = ((accounts ?? []) as { platform: Account["platform"]; scopes: string[] | null }[]).filter((a) => hasStatsScopes(a.platform, a.scopes ?? []));
    if (!counted.length) return false;
    const cutoff = now - CATCH_UP_AFTER_HOURS * 3_600_000;
    const lastRun = new Map((syncs ?? []).map((s) => [s.platform as string, Date.parse((s.last_run_at as string | null) ?? "") || 0]));
    // Never copied: no row yet, or a row without a run (a newly connected account's, 0079).
    const neverRun = counted.some((a) => !lastRun.get(a.platform));
    const overdue = counted.some((a) => (lastRun.get(a.platform) ?? 0) < cutoff);
    if (!overdue) return false;
    if (!neverRun) {
      // Mark it started; whoever's update finds the old date first gets to run it.
      const { data: claimed, error } = await admin
        .from("analytics_syncs")
        .update({ last_run_at: new Date(now).toISOString() })
        .eq("team_id", teamId)
        .lt("last_run_at", new Date(cutoff).toISOString())
        .select("platform");
      if (error || !claimed?.length) return false;
    }
    recentCatchUps.set(teamId, now);
    return true;
  } catch {
    return false;
  }
}

/** The daily job: every team with a connected account (within a time budget). */
/** Every team (least recently copied first) until the time runs out. `skipOkSince`: leave out platforms copied fine since then. */
export async function syncAllTeams(budgetMs = 50_000, o: { skipOkSince?: number; log?: boolean } = {}) {
  const admin = createAdminClient();
  const started = Date.now();
  const { data } = await admin.from("social_accounts").select("team_id").eq("status", "active");
  const teams = [...new Set((data ?? []).map((r) => r.team_id as string))];
  // Least recently synced first, so a long run never starves the same team.
  const { data: syncs } = await admin.from("analytics_syncs").select("team_id, last_run_at");
  const last = new Map<string, number>();
  for (const s of syncs ?? []) last.set(s.team_id as string, Math.max(last.get(s.team_id as string) ?? 0, Date.parse((s.last_run_at as string) ?? "") || 0));
  teams.sort((a, b) => (last.get(a) ?? 0) - (last.get(b) ?? 0));
  const results: { team: string; results: SyncResult[] }[] = [];
  for (const t of teams) {
    if (Date.now() - started > budgetMs) break;
    results.push({ team: t, results: await syncTeamAnalytics(t, { skipOkSince: o.skipOkSince, log: o.log }) });
  }
  return { teams: teams.length, synced: results.length, results };
}
