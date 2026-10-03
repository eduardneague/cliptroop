import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/social/tokens";
import { FB_GRAPH, hasStatsScopes, STATS_SCOPES, type SocialPlatform } from "@/lib/social/providers";

/*
 * Copies the platforms' numbers into our analytics tables (migration 0058).
 * Runs once a day for every team (/api/cron/analytics) and on "Sync now".
 * The first copy fetches history (90 days of totals, 28 days of the per-day
 * details); later copies refresh the last few days (platforms keep updating
 * recent numbers for a couple of days). Every platform call is official API,
 * read-only. Never throws: problems are saved on analytics_syncs.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Account = { id: string; team_id: string; platform: SocialPlatform; external_id: string | null; scopes: string[] | null };
export type SyncResult = { platform: SocialPlatform; ok: boolean; error?: string; rows: number; note?: string | null };

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * DAY));
const dayRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) out.push(iso(new Date(t)));
  return out;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

class ApiError extends Error {
  constructor(
    message: string,
    public status = 0
  ) {
    super(message);
  }
}

async function get(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    // (Instagram takes the token in the address instead: no header then.)
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {}
  const err = body.error as { message?: string; code?: string } | string | undefined;
  // TikTok answers 200 with error.code "ok" on success.
  const tiktokOk = typeof err === "object" && err?.code === "ok";
  if (!res.ok || (err && !tiktokOk)) {
    const msg = typeof err === "string" ? err : err?.message || `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return body;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

const YTA = "https://youtubeanalytics.googleapis.com/v2/reports";
const YT = "https://www.googleapis.com/youtube/v3";

function ytReport(token: string, p: Record<string, string>) {
  return get(`${YTA}?${new URLSearchParams({ ids: "channel==MINE", ...p })}`, token) as Promise<{ columnHeaders?: { name: string }[]; rows?: unknown[][] }>;
}
const rowsOf = (r: { columnHeaders?: { name: string }[]; rows?: unknown[][] }) => {
  const names = (r.columnHeaders ?? []).map((h) => h.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])) as Record<string, unknown>);
};
/** "PT1M5S" → 65 */
const isoDuration = (d: unknown) => {
  const m = typeof d === "string" ? d.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/) : null;
  return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0) : null;
};

async function syncYouTube(admin: Admin, acc: Account, backfill: boolean, links: Links): Promise<{ rows: number; revenueNote: string | null; note: string | null }> {
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

  // Channel totals right now (subscribers, all-time views) on today's row.
  try {
    const ch = (await get(`${YT}/channels?part=statistics,contentDetails&mine=true`, token)) as { items?: { statistics?: Record<string, string>; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] };
    const st = ch.items?.[0]?.statistics;
    if (st) put(end, "all", { followers: num(st.subscriberCount), total_views: num(st.viewCount) });
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (uploads) rows += await syncYouTubeVideos(admin, acc, token, uploads, links);
  } catch {}

  rows += await upsert(admin, "analytics_daily", [...daily.values()], "team_id,platform,day,content");

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
  if ((acc.scopes ?? []).includes(STATS_SCOPES.youtube[1])) {
    try {
      const currency = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
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
      const now = new Date().toISOString();
      const recs = rev.map((r) => ({
        team_id: acc.team_id,
        platform: "youtube",
        day: String(r.day),
        content: "all",
        revenue: num(r.estimatedRevenue) ?? 0,
        currency,
        updated_at: now,
        ...(detailed ? { ad_revenue: num(r.estimatedAdRevenue), premium_revenue: num(r.estimatedRedPartnerRevenue), gross_revenue: num(r.grossRevenue) } : {}),
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
          rows += await upsert(admin, "analytics_revenue_daily", recs, "team_id,platform,day,content");
        } catch (e) {
          // Before migration 0061 the stream columns don't exist: save the totals alone.
          if (!/ad_revenue|premium_revenue|gross_revenue|column/i.test(e instanceof Error ? e.message : "")) throw e;
          rows += await upsert(admin, "analytics_revenue_daily", recs.map(({ team_id, platform, day, content, revenue, currency, updated_at }) => ({ team_id, platform, day, content, revenue, currency, updated_at })), "team_id,platform,day,content");
        }
      }
    } catch (e) {
      revenueNote = e instanceof Error ? `Revenue: ${e.message}` : "Revenue isn't available for this channel.";
    }
  } else revenueNote = "Reconnect YouTube to include revenue.";
  return { rows, revenueNote, note: countryError ? `countries: ${countryError}` : null };
}

async function syncYouTubeVideos(admin: Admin, acc: Account, token: string, uploads: string, links: Links) {
  const items = (await get(`${YT}/playlistItems?${new URLSearchParams({ part: "contentDetails", playlistId: uploads, maxResults: "50" })}`, token)) as { items?: { contentDetails?: { videoId?: string } }[] };
  const ids = (items.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => !!x);
  if (!ids.length) return 0;
  const vids = (await get(`${YT}/videos?${new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.join(","), maxResults: "50" })}`, token)) as {
    items?: { id: string; snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: Record<string, string>; contentDetails?: { duration?: string } }[];
  };
  const recs = (vids.items ?? []).map((v) => {
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
    };
  });
  return upsert(admin, "analytics_content", recs, "team_id,platform,external_id");
}

// ---------------------------------------------------------------------------
// Instagram (Instagram API with Instagram Login)
// ---------------------------------------------------------------------------

const IG = () => `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_VERSION || "v23.0"}`;
const unix = (day: string, end = false) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) + (end ? 86_400 : 0);

async function syncInstagram(admin: Admin, acc: Account, backfill: boolean, links: Links) {
  const token = await getAccessToken(acc.id);
  const igId = acc.external_id ?? "me";
  const q = (path: string, p: Record<string, string>) => get(`${IG()}/${path}?${new URLSearchParams({ ...p, access_token: token })}`, "");
  let rows = 0;
  const daily = new Map<string, Record<string, unknown>>();
  const put = (day: string, v: Record<string, unknown>) =>
    daily.set(day, { ...(daily.get(day) ?? { team_id: acc.team_id, platform: "instagram", day, content: "all" }), ...v, updated_at: new Date().toISOString() });

  // Per-day totals (views, likes, comments, shares, saves). One call per day.
  // If Instagram refuses a metric, fall back to a shorter list.
  const METRIC_SETS = ["views,likes,comments,shares,saves,total_interactions,reach", "views,likes,comments,shares", "views"];
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
      for (const m of r.data ?? []) {
        const val = num(m.total_value?.value);
        if (m.name === "views") v.views = val;
        else if (m.name === "likes") v.likes = val;
        else if (m.name === "comments") v.comments = val;
        else if (m.name === "shares") v.shares = val;
        else if (m.name === "saves") v.saves = val;
        else if (m.name === "reach") v.reach = val;
      }
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
  rows += await upsert(admin, "analytics_daily", [...daily.values()], "team_id,platform,day,content");

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
    const recs = [];
    for (const m of media.data ?? []) {
      const link = links.byExternal.get(`instagram:${m.id}`) ?? (m.permalink ? links.byUrl(m.permalink) : null);
      let views: number | null = null;
      let reach: number | null = null;
      let shares: number | null = null;
      let saves: number | null = null;
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
      recs.push({
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
    rows += await upsert(admin, "analytics_content", recs, "team_id,platform,external_id");
  } catch {}
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
// Facebook (a Page: analytics only)
// ---------------------------------------------------------------------------

/** Facebook's daily values end at midnight Pacific: the value belongs to the day before end_time. */
const fbDay = (endTime: string) => new Date(Date.parse(endTime) - 12 * 3_600_000).toISOString().slice(0, 10);

async function syncFacebook(admin: Admin, acc: Account, backfill: boolean, links: Links) {
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

  // Followers right now (on today's row, like the other snapshots).
  try {
    const page = (await q(pageId, { fields: "followers_count,fan_count" })) as { followers_count?: number; fan_count?: number };
    const f = num(page.followers_count) ?? num(page.fan_count);
    if (f !== null) put(daysAgo(0), { followers: f });
  } catch {}
  rows += await upsert(admin, "analytics_daily", [...daily.values()], "team_id,platform,day,content");

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
  const recs = posts.map((m) => {
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
  rows += await upsert(admin, "analytics_content", recs, "team_id,platform,external_id");
  if (!ok) throw new ApiError(`Facebook refused every Page metric${failed.length ? ` (${failed[0]})` : ""}. Check the Page permissions (read_insights).`);
  return { rows, note: `${ok} of ${METRICS.length} metrics, ${recs.length} posts${countries ? `, ${countries} countries` : ""}` };
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

async function upsert(admin: Admin, table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (!rows.length) return 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from(table).upsert(chunk, { onConflict });
    if (error) throw new ApiError(`Saving ${table}: ${error.message}`);
    n += chunk.length;
  }
  return n;
}

// ---------------------------------------------------------------------------

/** Copy one team's numbers from every connected platform that allows it. */
export async function syncTeamAnalytics(teamId: string): Promise<SyncResult[]> {
  const admin = createAdminClient();
  const { data: accounts } = await admin.from("social_accounts").select("id, team_id, platform, external_id, scopes").eq("team_id", teamId).eq("status", "active");
  if (!accounts?.length) return [];
  const { data: syncs } = await admin.from("analytics_syncs").select("platform, backfilled").eq("team_id", teamId);
  const done = new Set((syncs ?? []).filter((s) => s.backfilled).map((s) => s.platform as string));
  const links = await linksFor(admin, teamId);
  const out: SyncResult[] = [];
  for (const a of accounts as Account[]) {
    if (!hasStatsScopes(a.platform, a.scopes ?? [])) {
      out.push({ platform: a.platform, ok: false, error: "Reconnect this account to allow stats.", rows: 0 });
      await admin.from("analytics_syncs").upsert({ team_id: teamId, platform: a.platform, last_run_at: new Date().toISOString(), last_error: "Reconnect this account to allow stats." }, { onConflict: "team_id,platform" });
      continue;
    }
    const backfill = !done.has(a.platform);
    try {
      let rows = 0;
      let revenueNote: string | null = null;
      let note: string | null = null;
      if (a.platform === "youtube") ({ rows, revenueNote, note } = await syncYouTube(admin, a, backfill, links));
      else if (a.platform === "instagram") ({ rows } = await syncInstagram(admin, a, backfill, links));
      else if (a.platform === "facebook") ({ rows, note } = await syncFacebook(admin, a, backfill, links));
      else ({ rows, note } = await syncTikTok(admin, a, links));
      const now = new Date().toISOString();
      await admin.from("analytics_syncs").upsert({ team_id: teamId, platform: a.platform, last_run_at: now, last_ok_at: now, last_error: null, backfilled: true, revenue_note: revenueNote }, { onConflict: "team_id,platform" });
      out.push({ platform: a.platform, ok: true, rows, note });
    } catch (e) {
      const message = (e instanceof Error ? e.message : "Unknown error").slice(0, 300);
      await admin.from("analytics_syncs").upsert({ team_id: teamId, platform: a.platform, last_run_at: new Date().toISOString(), last_error: message }, { onConflict: "team_id,platform" });
      out.push({ platform: a.platform, ok: false, error: message, rows: 0 });
    }
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
    const neverRun = counted.some((a) => !lastRun.has(a.platform));
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
export async function syncAllTeams(budgetMs = 50_000) {
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
    results.push({ team: t, results: await syncTeamAnalytics(t) });
  }
  return { teams: teams.length, synced: results.length, results };
}
