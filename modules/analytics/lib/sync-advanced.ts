import "server-only";
import { ApiError, daysAgo, get, inBatches, num, upsert, YT, ytFirst, type Admin } from "./sync-core";
import { retentionPoints } from "./retention";

export { facebookRetention } from "./retention";

/*
 * The Advanced page's numbers (migration 0081), copied with the daily copy:
 * how views split (traffic sources, search terms, devices, places, who
 * watches), each video's retention curve and its own traffic, and the
 * audience's age, gender and cities. Every call here is optional: a
 * platform that refuses one just leaves that part empty, and nothing here
 * ever stops the main copy. A shared deadline keeps a team's copy short.
 */

type Row = Record<string, unknown>;
export type Advanced = { admin: Admin; teamId: string; deadline: number };
const timeLeft = (a: Advanced) => Date.now() < a.deadline;

/** Window snapshots (the last 7 / 28 / 90 / 365 days) are fetched again after this long. */
const WINDOW_REFRESH_MS = 20 * 3_600_000;
export const WINDOW_SPANS = [7, 28, 90, 365] as const;
const minusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** When this platform's window snapshots were last fetched (0: never, or before 0081). */
async function windowsFetchedAt(a: Advanced, platform: string) {
  const { data, error } = await a.admin
    .from("analytics_breakdowns")
    .select("updated_at")
    .eq("team_id", a.teamId)
    .eq("platform", platform)
    .eq("external_id", "")
    .not("span", "in", "(0,1)")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) return null; // Before migration 0081: nowhere to keep them.
  return Date.parse(((data?.[0] as Row | undefined)?.updated_at as string | undefined) ?? "") || 0;
}

/** Replace one window snapshot (one dimension, one span) with what the platform said now. */
async function saveWindow(a: Advanced, platform: string, dimension: string, span: number, day: string, rows: { key: string; views?: number | null; watch_minutes?: number | null; value?: number | null }[], externalId = "") {
  const now = new Date().toISOString();
  const clean = rows
    .filter((r) => r.key && r.key.length <= 300)
    .map((r) => ({ team_id: a.teamId, platform, external_id: externalId, dimension, key: r.key, day, span, views: r.views ?? null, watch_minutes: r.watch_minutes ?? null, value: r.value ?? null, updated_at: now }));
  // Same key twice (a platform repeating a name): the first one counts.
  const seen = new Set<string>();
  const unique = clean.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
  const n = unique.length ? await upsert(a.admin, "analytics_breakdowns", unique, "team_id,platform,external_id,dimension,span,day,key") : 0;
  // The earlier snapshot of this window goes (and keys that dropped out of this one).
  await a.admin.from("analytics_breakdowns").delete().eq("team_id", a.teamId).eq("platform", platform).eq("external_id", externalId).eq("dimension", dimension).eq("span", span).lt("updated_at", now);
  return n;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

/** Per-day splits, over the same days as the main copy. [dimension, YouTube's dimension, metric lists]. */
const YT_DAILY: [string, string, string[]][] = [
  ["traffic_source", "insightTrafficSourceType", ["views,estimatedMinutesWatched"]],
  ["device", "deviceType", ["views,estimatedMinutesWatched"]],
  ["os", "operatingSystem", ["views,estimatedMinutesWatched"]],
  ["playback_location", "insightPlaybackLocationType", ["views,estimatedMinutesWatched"]],
  ["subscribed", "subscribedStatus", ["views,estimatedMinutesWatched,averageViewPercentage", "views,estimatedMinutesWatched"]],
  ["product", "youtubeProduct", ["views,estimatedMinutesWatched"]],
];

/** Traffic source details worth naming: [dimension, traffic source]. */
const YT_DETAILS: [string, string][] = [
  ["search_term", "YT_SEARCH"],
  ["external_site", "EXT_URL"],
  ["suggested_by", "RELATED_VIDEO"],
  ["playlist", "PLAYLIST"],
];

export async function youtubeDailySplits(a: Advanced, token: string, start: string, end: string) {
  let rows = 0;
  const now = new Date().toISOString();
  const results = await Promise.all(
    YT_DAILY.map(async ([dimension, ytDim, lists]) => {
      const r = await ytFirst(token, { startDate: start, endDate: end, dimensions: `day,${ytDim}`, sort: "day" }, lists);
      return r ? { dimension, ytDim, rows: r.rows } : null;
    })
  );
  const recs: Row[] = [];
  for (const res of results) {
    if (!res) continue;
    for (const r of res.rows) {
      const key = String(r[res.ytDim] ?? "");
      if (!key) continue;
      recs.push({
        team_id: a.teamId,
        platform: "youtube",
        external_id: "",
        dimension: res.dimension,
        key,
        day: String(r.day),
        span: 1,
        views: num(r.views),
        watch_minutes: num(r.estimatedMinutesWatched),
        value: num(r.averageViewPercentage),
        updated_at: now,
      });
    }
  }
  if (recs.length) {
    try {
      rows += await upsert(a.admin, "analytics_breakdowns", recs, "team_id,platform,external_id,dimension,span,day,key");
    } catch {
      return 0; // Before migration 0081.
    }
  }
  return rows;
}

/** Titles for the videos and playlists that sent views (YouTube only gives ids). */
export async function ytTitles(token: string, kind: "videos" | "playlists", ids: string[]) {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const r = (await get(`${YT}/${kind}?${new URLSearchParams({ part: "snippet", id: ids.slice(i, i + 50).join(","), maxResults: "50" })}`, token)) as { items?: { id: string; snippet?: { title?: string; channelTitle?: string } }[] };
      for (const it of r.items ?? []) out.set(it.id, [it.snippet?.title, it.snippet?.channelTitle].filter(Boolean).join(" · "));
    } catch {}
  }
  return out;
}

/**
 * Window snapshots for the account: age & gender, sharing services, search
 * terms, outside sites, videos and playlists that sent views, traffic by
 * Shorts / long videos, and (1.21.0) views by country. Once a day (they move
 * slowly). The last 7, 28, 90 and 365 days, then the channel's whole life
 * (span 0, 1.21.0): Lifetime's splits, and countries for ranges older than
 * the per-day countries kept.
 */
export async function youtubeWindows(a: Advanced, token: string, end: string) {
  const at = await windowsFetchedAt(a, "youtube");
  if (at === null || Date.now() - at < WINDOW_REFRESH_MS) return 0;
  let rows = 0;
  for (const span of [...WINDOW_SPANS, 0]) {
    if (!timeLeft(a)) break;
    const base = { startDate: span ? minusDays(end, span - 1) : "2005-04-23", endDate: end };
    const jobs: Promise<number>[] = [
      (async () => {
        const r = await ytFirst(token, { ...base, dimensions: "country", sort: "-views" }, ["views,estimatedMinutesWatched", "views"]);
        return r
          ? saveWindow(
              a,
              "youtube",
              "country",
              span,
              end,
              r.rows.filter((x) => /^[A-Z]{2}$/.test(String(x.country)) && x.country !== "ZZ").map((x) => ({ key: String(x.country), views: num(x.views), watch_minutes: num(x.estimatedMinutesWatched) }))
            )
          : 0;
      })(),
      (async () => {
        const r = await ytFirst(token, { ...base, dimensions: "ageGroup,gender", sort: "gender,ageGroup" }, ["viewerPercentage"]);
        return r ? saveWindow(a, "youtube", "age_gender", span, end, r.rows.map((x) => ({ key: `${x.ageGroup}|${x.gender}`, value: num(x.viewerPercentage) }))) : 0;
      })(),
      (async () => {
        const r = await ytFirst(token, { ...base, dimensions: "sharingService", sort: "-shares" }, ["shares"]);
        return r ? saveWindow(a, "youtube", "sharing", span, end, r.rows.map((x) => ({ key: String(x.sharingService), value: num(x.shares) }))) : 0;
      })(),
      (async () => {
        const r = await ytFirst(token, { ...base, dimensions: "creatorContentType,insightTrafficSourceType", sort: "-views" }, ["views,estimatedMinutesWatched"]);
        return r ? saveWindow(a, "youtube", "traffic_by_type", span, end, r.rows.map((x) => ({ key: `${x.creatorContentType}|${x.insightTrafficSourceType}`, views: num(x.views), watch_minutes: num(x.estimatedMinutesWatched) }))) : 0;
      })(),
      ...YT_DETAILS.map(async ([dimension, source]) => {
        const r = await ytFirst(token, { ...base, dimensions: "insightTrafficSourceDetail", filters: `insightTrafficSourceType==${source}`, sort: "-views", maxResults: "25" }, ["views,estimatedMinutesWatched"]);
        if (!r) return 0;
        let list = r.rows.map((x) => ({ key: String(x.insightTrafficSourceDetail ?? ""), views: num(x.views), watch_minutes: num(x.estimatedMinutesWatched) })).filter((x) => x.key);
        // Videos and playlists come as ids: "id|title · channel".
        if (dimension === "suggested_by" || dimension === "playlist") {
          const names = await ytTitles(token, dimension === "playlist" ? "playlists" : "videos", list.map((x) => x.key));
          list = list.map((x) => ({ ...x, key: `${x.key}|${(names.get(x.key) ?? "").slice(0, 250)}` }));
        }
        return saveWindow(a, "youtube", dimension, span, end, list);
      }),
    ];
    try {
      rows += (await Promise.all(jobs.map((j) => j.catch(() => 0)))).reduce((t, n) => t + n, 0);
    } catch {}
  }
  return rows;
}

/**
 * One video's splits since it was posted (1.21.0, its analytics page's
 * Reach and Audience tabs, like YouTube Studio's): [our dimension,
 * YouTube's, metric lists, a filter on top of the video, sort, how many].
 */
const VIDEO_SPLITS: { dimension: string; yt: string; lists: string[]; filter?: string; sort?: string; max?: string }[] = [
  { dimension: "traffic_source", yt: "insightTrafficSourceType", lists: ["views,estimatedMinutesWatched"], sort: "-views" },
  { dimension: "search_term", yt: "insightTrafficSourceDetail", lists: ["views,estimatedMinutesWatched"], filter: "insightTrafficSourceType==YT_SEARCH", sort: "-views", max: "25" },
  { dimension: "external_site", yt: "insightTrafficSourceDetail", lists: ["views,estimatedMinutesWatched"], filter: "insightTrafficSourceType==EXT_URL", sort: "-views", max: "25" },
  { dimension: "suggested_by", yt: "insightTrafficSourceDetail", lists: ["views,estimatedMinutesWatched"], filter: "insightTrafficSourceType==RELATED_VIDEO", sort: "-views", max: "25" },
  { dimension: "playlist", yt: "insightTrafficSourceDetail", lists: ["views,estimatedMinutesWatched"], filter: "insightTrafficSourceType==PLAYLIST", sort: "-views", max: "25" },
  { dimension: "subscribed", yt: "subscribedStatus", lists: ["views,estimatedMinutesWatched,averageViewPercentage", "views,estimatedMinutesWatched"] },
  { dimension: "device", yt: "deviceType", lists: ["views,estimatedMinutesWatched"], sort: "-views" },
  { dimension: "os", yt: "operatingSystem", lists: ["views,estimatedMinutesWatched"], sort: "-views" },
  { dimension: "playback_location", yt: "insightPlaybackLocationType", lists: ["views,estimatedMinutesWatched"], sort: "-views" },
  { dimension: "country", yt: "country", lists: ["views,estimatedMinutesWatched"], sort: "-views" },
  { dimension: "age_gender", yt: "ageGroup,gender", lists: ["viewerPercentage"], sort: "gender,ageGroup" },
  { dimension: "sharing", yt: "sharingService", lists: ["shares"], sort: "-shares" },
];

/** Fetches and keeps one video's splits (span 0, the video's id), each replacing the last; a split YouTube refuses keeps what it had. */
export async function youtubeVideoSplits(a: Advanced, token: string, id: string, start: string, end: string): Promise<number> {
  const results = await Promise.all(
    VIDEO_SPLITS.map(async (d) => {
      const r = await ytFirst(token, { startDate: start, endDate: end, dimensions: d.yt, filters: `video==${id}${d.filter ? `;${d.filter}` : ""}`, ...(d.sort ? { sort: d.sort } : {}), ...(d.max ? { maxResults: d.max } : {}) }, d.lists);
      return { d, list: r?.rows ?? null };
    })
  );
  let rows = 0;
  for (const { d, list } of results) {
    if (!list) continue;
    let recs: { key: string; views?: number | null; watch_minutes?: number | null; value?: number | null }[];
    if (d.dimension === "age_gender") recs = list.map((x) => ({ key: `${x.ageGroup}|${x.gender}`, value: num(x.viewerPercentage) }));
    else if (d.dimension === "sharing") recs = list.map((x) => ({ key: String(x.sharingService ?? ""), value: num(x.shares) }));
    else if (d.dimension === "country") recs = list.filter((x) => /^[A-Z]{2}$/.test(String(x.country)) && x.country !== "ZZ").map((x) => ({ key: String(x.country), views: num(x.views), watch_minutes: num(x.estimatedMinutesWatched) }));
    else {
      const field = d.yt;
      recs = list.map((x) => ({ key: String(x[field] ?? ""), views: num(x.views), watch_minutes: num(x.estimatedMinutesWatched), value: d.dimension === "subscribed" ? num(x.averageViewPercentage) : null })).filter((x) => x.key);
      // Videos and playlists come as ids: "id|title · channel".
      if (d.dimension === "suggested_by" || d.dimension === "playlist") {
        const names = await ytTitles(token, d.dimension === "playlist" ? "playlists" : "videos", recs.map((x) => x.key));
        recs = recs.map((x) => ({ ...x, key: `${x.key}|${(names.get(x.key) ?? "").slice(0, 250)}` }));
      }
    }
    try {
      rows += await saveWindow(a, "youtube", d.dimension, 0, end, recs, id);
    } catch {
      return rows; // Before migration 0081: nowhere to keep them.
    }
  }
  return rows;
}

/**
 * Each video's own story, a few videos per run: its retention curve, where
 * its views came from and what people searched to find it (since it was
 * published). New videos first and again every two days while they're
 * young; older ones every two weeks.
 */
export async function youtubeVideoDetails(a: Advanced, token: string, videos: { id: string; publishedAt: string | null }[], perRun = 6) {
  if (!videos.length) return 0;
  const { data, error } = await a.admin.from("analytics_retention").select("external_id, updated_at").eq("team_id", a.teamId).eq("platform", "youtube").in("external_id", videos.map((v) => v.id).slice(0, 200));
  if (error) return 0; // Before migration 0081.
  const fetched = new Map(((data ?? []) as Row[]).map((r) => [r.external_id as string, Date.parse(r.updated_at as string) || 0]));
  const now = Date.now();
  const due = videos
    .filter((v) => {
      const at = fetched.get(v.id);
      if (!at) return true;
      const age = v.publishedAt ? now - Date.parse(v.publishedAt) : Infinity;
      return now - at > (age < 30 * 86_400_000 ? 2 : 14) * 86_400_000;
    })
    // Never fetched first, then the newest.
    .sort((x, y) => Number(fetched.has(x.id)) - Number(fetched.has(y.id)) || (y.publishedAt ?? "").localeCompare(x.publishedAt ?? ""))
    .slice(0, perRun);
  let rows = 0;
  const today = daysAgo(0);
  const end = daysAgo(1);
  await inBatches(due, 2, async (v) => {
    if (!timeLeft(a)) return;
    const startDate = v.publishedAt ? v.publishedAt.slice(0, 10) : "2005-04-23";
    const base = { startDate: startDate > end ? end : startDate, endDate: today };
    const [curve, traffic, terms] = await Promise.all([
      ytFirst(token, { ...base, dimensions: "elapsedVideoTimeRatio", filters: `video==${v.id}` }, ["audienceWatchRatio,relativeRetentionPerformance", "audienceWatchRatio"]),
      ytFirst(token, { ...base, dimensions: "insightTrafficSourceType", filters: `video==${v.id}`, sort: "-views" }, ["views,estimatedMinutesWatched"]),
      ytFirst(token, { ...base, dimensions: "insightTrafficSourceDetail", filters: `video==${v.id};insightTrafficSourceType==YT_SEARCH`, sort: "-views", maxResults: "25" }, ["views,estimatedMinutesWatched"]),
    ]);
    try {
      const points = curve ? retentionPoints(curve.rows) : [];
      // Saved even when empty (a video too new or too small for a curve), so it waits its turn.
      rows += await upsert(a.admin, "analytics_retention", [{ team_id: a.teamId, platform: "youtube", external_id: v.id, points, updated_at: new Date().toISOString() }], "team_id,platform,external_id");
      if (traffic) rows += await saveWindow(a, "youtube", "traffic_source", 0, end, traffic.rows.map((x) => ({ key: String(x.insightTrafficSourceType), views: num(x.views), watch_minutes: num(x.estimatedMinutesWatched) })), v.id);
      if (terms) rows += await saveWindow(a, "youtube", "search_term", 0, end, terms.rows.map((x) => ({ key: String(x.insightTrafficSourceDetail ?? ""), views: num(x.views), watch_minutes: num(x.estimatedMinutesWatched) })).filter((x) => x.key), v.id);
    } catch {}
  });
  return rows;
}

/** Lifetime per-video numbers beyond the basics, for these videos (≤ 50 per call): into `metrics`. */
export async function youtubeVideoExtras(token: string, ids: string[]) {
  const out = new Map<string, Record<string, number | null>>();
  if (!ids.length) return out;
  const FAMILIES: { lists: string[]; map: (r: Row) => Record<string, number | null> }[] = [
    {
      lists: ["shares,dislikes,subscribersLost,videosAddedToPlaylists,videosRemovedFromPlaylists", "shares,dislikes,subscribersLost"],
      map: (r) => ({ shares: num(r.shares), dislikes: num(r.dislikes), subscribers_lost: num(r.subscribersLost), playlist_adds: num(r.videosAddedToPlaylists), playlist_removes: num(r.videosRemovedFromPlaylists) }),
    },
    { lists: ["redViews,estimatedRedMinutesWatched"], map: (r) => ({ premium_views: num(r.redViews), premium_watch_minutes: num(r.estimatedRedMinutesWatched) }) },
    {
      lists: ["cardImpressions,cardClicks,cardTeaserImpressions,cardTeaserClicks"],
      map: (r) => ({ card_impressions: num(r.cardImpressions), card_clicks: num(r.cardClicks), card_teaser_impressions: num(r.cardTeaserImpressions), card_teaser_clicks: num(r.cardTeaserClicks) }),
    },
  ];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const base = { startDate: "2005-04-23", endDate: daysAgo(0), dimensions: "video", filters: `video==${chunk.join(",")}`, maxResults: "50" };
    const results = await Promise.all(FAMILIES.map((f) => ytFirst(token, { ...base, sort: `-${f.lists[0].split(",")[0]}` }, f.lists)));
    results.forEach((res, k) => {
      for (const r of res?.rows ?? []) {
        const id = String(r.video ?? "");
        if (id) out.set(id, { ...(out.get(id) ?? {}), ...FAMILIES[k].map(r) });
      }
    });
  }
  return out;
}

/** Each video's money (needs the revenue permission): into analytics_content_revenue. */
export async function youtubeVideoRevenue(a: Advanced, token: string, ids: string[], currency: string) {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const recs: Row[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await ytFirst(
      token,
      { startDate: "2005-04-23", endDate: daysAgo(0), dimensions: "video", filters: `video==${chunk.join(",")}`, sort: "-estimatedRevenue", maxResults: "50", currency },
      ["estimatedRevenue,estimatedAdRevenue,estimatedRedPartnerRevenue,grossRevenue,cpm,playbackBasedCpm,adImpressions,monetizedPlaybacks", "estimatedRevenue,estimatedAdRevenue,grossRevenue", "estimatedRevenue"]
    );
    for (const x of r?.rows ?? []) {
      const id = String(x.video ?? "");
      if (!id) continue;
      recs.push({
        team_id: a.teamId,
        platform: "youtube",
        external_id: id,
        revenue: num(x.estimatedRevenue),
        ad_revenue: num(x.estimatedAdRevenue),
        premium_revenue: num(x.estimatedRedPartnerRevenue),
        gross_revenue: num(x.grossRevenue),
        cpm: num(x.cpm),
        playback_cpm: num(x.playbackBasedCpm),
        ad_impressions: num(x.adImpressions),
        monetized_playbacks: num(x.monetizedPlaybacks),
        currency,
        updated_at: now,
      });
    }
  }
  try {
    return recs.length ? await upsert(a.admin, "analytics_content_revenue", recs, "team_id,platform,external_id") : 0;
  } catch {
    return 0; // Before migration 0081.
  }
}

/** Per-day money beyond the revenue itself: CPM, playback-based CPM, ad impressions, monetized playbacks. */
export async function youtubeDailyMoney(token: string, start: string, end: string, currency: string) {
  const r = await ytFirst(token, { startDate: start, endDate: end, dimensions: "day", sort: "day", currency }, ["cpm,playbackBasedCpm,adImpressions,monetizedPlaybacks", "cpm,playbackBasedCpm", "cpm"]);
  const out = new Map<string, Record<string, number | null>>();
  for (const x of r?.rows ?? [])
    out.set(String(x.day), { cpm: num(x.cpm), playback_cpm: num(x.playbackBasedCpm), ad_impressions: num(x.adImpressions), monetized_playbacks: num(x.monetizedPlaybacks) });
  return out;
}

/** Per-day channel numbers beyond the main ones: into analytics_daily.metrics. */
export async function youtubeDailyExtras(token: string, start: string, end: string) {
  const base = { startDate: start, endDate: end, dimensions: "day", sort: "day" };
  const [premium, playlists, cards] = await Promise.all([
    ytFirst(token, base, ["redViews,estimatedRedMinutesWatched"]),
    ytFirst(token, base, ["videosRemovedFromPlaylists"]),
    ytFirst(token, base, ["cardImpressions,cardClicks,cardTeaserImpressions,cardTeaserClicks"]),
  ]);
  const out = new Map<string, Record<string, number | null>>();
  const add = (day: string, v: Record<string, number | null>) => out.set(day, { ...(out.get(day) ?? {}), ...v });
  for (const r of premium?.rows ?? []) add(String(r.day), { premium_views: num(r.redViews), premium_watch_minutes: num(r.estimatedRedMinutesWatched) });
  for (const r of playlists?.rows ?? []) add(String(r.day), { playlist_removes: num(r.videosRemovedFromPlaylists) });
  for (const r of cards?.rows ?? []) add(String(r.day), { card_impressions: num(r.cardImpressions), card_clicks: num(r.cardClicks), card_teaser_impressions: num(r.cardTeaserImpressions), card_teaser_clicks: num(r.cardTeaserClicks) });
  return out;
}

/**
 * Shorts vs long videos per day beyond views: average view duration and %
 * viewed (weighted by views when live streams join long videos), engaged
 * views, subscribers gained and lost.
 */
export async function youtubeTypeAverages(token: string, start: string, end: string) {
  const r = await ytFirst(
    token,
    { startDate: start, endDate: end, dimensions: "day,creatorContentType", sort: "day" },
    ["views,engagedViews,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost", "views,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost", "views,averageViewDuration,averageViewPercentage"]
  );
  const acc = new Map<string, { views: number; dur: number; pct: number; engaged: number | null; gained: number | null; lost: number | null }>();
  for (const x of r?.rows ?? []) {
    const type = String(x.creatorContentType ?? "");
    // (1.22.0: live streams apart from long videos.)
    const content = type === "SHORTS" ? "shorts" : type === "VIDEO_ON_DEMAND" ? "long" : type === "LIVE_STREAM" ? "live" : null;
    if (!content) continue;
    const k = `${x.day}|${content}`;
    const v = num(x.views) ?? 0;
    const cur = acc.get(k) ?? { views: 0, dur: 0, pct: 0, engaged: null, gained: null, lost: null };
    cur.views += v;
    cur.dur += (num(x.averageViewDuration) ?? 0) * v;
    cur.pct += (num(x.averageViewPercentage) ?? 0) * v;
    if (num(x.engagedViews) !== null) cur.engaged = (cur.engaged ?? 0) + num(x.engagedViews)!;
    if (num(x.subscribersGained) !== null) cur.gained = (cur.gained ?? 0) + num(x.subscribersGained)!;
    if (num(x.subscribersLost) !== null) cur.lost = (cur.lost ?? 0) + num(x.subscribersLost)!;
    acc.set(k, cur);
  }
  const out = new Map<string, Row>();
  for (const [k, v] of acc)
    out.set(k, {
      ...(v.views ? { avg_view_seconds: Math.round((v.dur / v.views) * 10) / 10, avg_view_pct: Math.round((v.pct / v.views) * 100) / 100 } : {}),
      ...(v.engaged !== null ? { engaged_views: v.engaged } : {}),
      ...(v.gained !== null ? { followers_gained: v.gained } : {}),
      ...(v.lost !== null ? { followers_lost: v.lost } : {}),
    });
  return out;
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

type IgQuery = (path: string, p: Record<string, string>) => Promise<Record<string, unknown>>;
type IgBreakdown = { data?: { name?: string; total_value?: { value?: number; breakdowns?: { dimension_keys?: string[]; results?: { dimension_values?: string[]; value?: number }[] }[] } }[] };
const igResults = (r: IgBreakdown) => r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
const unix = (day: string, end = false) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) + (end ? 86_400 : 0);

/**
 * Instagram's splits for the last 7 and 28 days (its limit is 30): views
 * from followers vs everyone else, views and interactions by kind of post,
 * follows and unfollows. Then who the followers and the engaged audience
 * are: age, gender, cities (and the engaged audience's countries). Once a day.
 */
export async function instagramWindows(a: Advanced, q: IgQuery, igId: string, end: string) {
  const at = await windowsFetchedAt(a, "instagram");
  if (at === null || Date.now() - at < WINDOW_REFRESH_MS) return 0;
  let rows = 0;
  const ask = async (metric: string, breakdowns: string[], extra: Record<string, string>) => {
    for (const breakdown of breakdowns) {
      try {
        return igResults((await q(`${igId}/insights`, { metric, metric_type: "total_value", breakdown, ...extra })) as IgBreakdown);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) throw e;
      }
    }
    return null;
  };
  const save = (dimension: string, span: number, list: { dimension_values?: string[]; value?: number }[] | null) =>
    list ? saveWindow(a, "instagram", dimension, span, end, list.map((x) => ({ key: (x.dimension_values ?? []).join("|"), value: num(x.value) })).filter((x) => x.key)) : Promise.resolve(0);
  try {
    for (const span of [7, 28] as const) {
      if (!timeLeft(a)) break;
      const period = { period: "day", since: String(unix(minusDays(end, span - 1))), until: String(unix(end, true)) };
      const [viewers, kinds, interactions, follows] = await Promise.all([
        ask("views", ["follower_type", "follow_type"], period),
        ask("views", ["media_product_type"], period),
        ask("total_interactions", ["media_product_type"], period),
        ask("follows_and_unfollows", ["follow_type"], period),
      ]);
      rows += await save("viewer_type", span, viewers);
      rows += await save("content_type", span, kinds);
      rows += await save("interactions_by_type", span, interactions);
      rows += await save("follows", span, follows);
    }
    // Who they are (span 0: as Instagram has it now). The engaged audience
    // needs a timeframe; its name changed over the API's versions.
    for (const [metric, prefix, breakdowns, timeframes] of [
      ["follower_demographics", "follower", ["age", "gender", "city"], [null]],
      ["engaged_audience_demographics", "engaged", ["age", "gender", "country", "city"], ["this_month", "last_30_days"]],
    ] as const) {
      if (!timeLeft(a)) break;
      const lists = await Promise.all(
        breakdowns.map(async (b) => {
          for (const timeframe of timeframes) {
            const list = await ask(metric, [b], { period: "lifetime", ...(timeframe ? { timeframe } : {}) });
            if (list) return list;
          }
          return null;
        })
      );
      for (let k = 0; k < breakdowns.length; k++) rows += await save(`${prefix}_${breakdowns[k]}`, 0, lists[k]);
    }
  } catch {
    /* refused: these parts stay empty */
  }
  return rows;
}
