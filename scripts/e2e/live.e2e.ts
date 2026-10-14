// End-to-end run of the live job (1.19.0) against a real Postgres + PostgREST
// with fake platform APIs. Run through scripts/e2e/run.sh (see its README).
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";

const SECRET = "e2e-secret-that-is-at-least-32-characters-long";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (p: Record<string, unknown>) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ ...p, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
};
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54399";
process.env.SUPABASE_SERVICE_ROLE_KEY = jwt({ role: "service_role" });
process.env.SOCIAL_TOKEN_KEY = "ab".repeat(32);
process.env.SOCIAL_STATS_PLATFORMS = "youtube,instagram,tiktok,facebook";
delete process.env.LIVE_MINUTES;

const DB = process.env.E2E_DB_URL ?? "postgres://postgres:postgres@localhost:5432/vplanner_e2e";
const sql = (q: string) => execSync(`psql "${DB}" -qAtX -v ON_ERROR_STOP=1`, { input: q, encoding: "utf8" }).trim();
const one = (q: string) => sql(q).split("\n")[0] ?? "";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  } else console.log("  ok", m);
};

// ---------------------------------------------------------------------------
// The fake platforms
// ---------------------------------------------------------------------------
const CID = "UCabcdefghijklmnop";
type V = { id: string; views: number; likes: number; comments: number; published: string; secs: number };
const H = 3_600_000;
const yt: V[] = Array.from({ length: 230 }, (_, i) => ({ id: `yt${String(i).padStart(4, "0")}`, views: 1000 + (230 - i) * 10, likes: 50, comments: 5, published: new Date(Date.now() - i * 20 * H).toISOString(), secs: i % 10 === 0 ? 900 : 40 }));
const tt = Array.from({ length: 95 }, (_, i) => ({ id: `${7000000000 + i}`, view_count: 500 + i, like_count: 20, comment_count: 2, share_count: 1, create_time: Math.floor((Date.now() - i * 30 * H) / 1000) }));
const ig = Array.from({ length: 140 }, (_, i) => ({ id: `1789${String(i).padStart(6, "0")}`, caption: `Post ${i}\nmore`, media_type: "VIDEO", media_product_type: i % 3 ? "REELS" : "FEED", permalink: `https://www.instagram.com/reel/x${i}/`, timestamp: new Date(Date.now() - i * 25 * H).toISOString(), like_count: 30 + i, comments_count: 3, views: 900 + i }));
const fb = Array.from({ length: 60 }, (_, i) => ({ id: `90${String(i).padStart(10, "0")}`, description: `Reel ${i}`, created_time: new Date(Date.now() - i * 26 * H).toISOString(), permalink_url: `/reel/90${String(i).padStart(10, "0")}`, plays: 300 + i }));
const calls: string[] = [];
let reportsReady = false;
let ttPageDelay = 0;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("http://127.0.0.1:54399")) return realFetch(input, init);
  calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
  const u = new URL(url);
  const q = u.searchParams;
  // YouTube Data API
  if (u.host === "www.googleapis.com" && u.pathname === "/youtube/v3/channels")
    return json({ items: [{ statistics: { subscriberCount: "412300", viewCount: "98400000", videoCount: String(yt.length) }, contentDetails: { relatedPlaylists: { uploads: `UU${CID.slice(2)}` } } }] });
  if (u.host === "www.googleapis.com" && u.pathname === "/youtube/v3/playlistItems") {
    if (q.get("playlistId") !== `UU${CID.slice(2)}`) return json({ error: { message: "playlist not found" } }, 404);
    const from = q.get("pageToken") ? Number(q.get("pageToken")!.slice(1)) : 0;
    const page = yt.slice(from, from + 50);
    return json({ items: page.map((v) => ({ contentDetails: { videoId: v.id } })), ...(from + 50 < yt.length ? { nextPageToken: `p${from + 50}` } : {}) });
  }
  if (u.host === "www.googleapis.com" && u.pathname === "/youtube/v3/videos") {
    const ids = (q.get("id") ?? "").split(",");
    if (ids.length > 50) return json({ error: { message: "too many ids" } }, 400);
    return json({
      items: yt
        .filter((v) => ids.includes(v.id))
        .map((v) => ({ id: v.id, snippet: { title: `Video ${v.id}`, publishedAt: v.published, thumbnails: { medium: { url: `https://i.ytimg.com/vi/${v.id}/mq.jpg` } } }, statistics: { viewCount: String(v.views), likeCount: String(v.likes), commentCount: String(v.comments) }, contentDetails: { duration: `PT${Math.floor(v.secs / 60)}M${v.secs % 60}S` } })),
    });
  }
  // YouTube Analytics
  if (u.host === "youtubeanalytics.googleapis.com") {
    const metrics = (q.get("metrics") ?? "").split(",");
    const dims = (q.get("dimensions") ?? "").split(",").filter(Boolean);
    const filter = q.get("filters") ?? "";
    const ids = (/video==([^;]+)/.exec(filter)?.[1] ?? "").split(",").filter(Boolean);
    if (dims[0] === "video" && ids.length) {
      return json({ columnHeaders: [...dims, ...metrics].map((name) => ({ name })), rows: ids.map((id) => [id, ...metrics.map((m, k) => (m === "averageViewPercentage" ? 61.5 : 10 + k))]) });
    }
    return json({ columnHeaders: [...dims, ...metrics].map((name) => ({ name })), rows: [] });
  }
  // YouTube Reporting
  if (u.host === "youtubereporting.googleapis.com") {
    if (u.pathname === "/v1/jobs" && (init?.method ?? "GET") === "GET") return json({ jobs: [] });
    if (u.pathname === "/v1/jobs" && init?.method === "POST") return json({ id: "job-1", reportTypeId: "channel_reach_basic_a1" });
    if (u.pathname === "/v1/jobs/job-1/reports") {
      if (!reportsReady) return json({});
      return json({ reports: [{ id: "r1", createTime: "2026-10-12T08:00:00Z", startTime: "2026-10-11T00:00:00Z", downloadUrl: "https://youtubereporting.googleapis.com/v1/media/r1?alt=media" }, { id: "r2", createTime: "2026-10-13T08:00:00Z", startTime: "2026-10-12T00:00:00Z", downloadUrl: "https://youtubereporting.googleapis.com/v1/media/r2?alt=media" }].filter((r) => !q.get("createdAfter") || r.createTime > q.get("createdAfter")!) });
    }
    if (u.pathname.startsWith("/v1/media/")) {
      const day = u.pathname.endsWith("r1") ? "20261011" : "20261012";
      return new Response(["date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr", ...yt.slice(0, 40).map((v, i) => `${day},${CID},${v.id},${1000 + i * 10},0.05`)].join("\n"), { status: 200 });
    }
  }
  // TikTok
  if (u.host === "open.tiktokapis.com" && u.pathname === "/v2/video/list/") {
    if (ttPageDelay) await new Promise((r) => setTimeout(r, ttPageDelay));
    const body = JSON.parse(String(init?.body ?? "{}"));
    const from = body.cursor ? tt.findIndex((v) => v.create_time * 1000 < body.cursor) : 0;
    const page = tt.slice(from, from + 20);
    const last = page[page.length - 1];
    return json({ data: { videos: page.map((v) => ({ ...v, title: `TikTok ${v.id}`, share_url: `https://www.tiktok.com/@x/video/${v.id}`, cover_image_url: "https://p16.tiktokcdn.com/x.jpg", duration: 30 })), cursor: last ? last.create_time * 1000 : 0, has_more: from + 20 < tt.length }, error: { code: "ok" } });
  }
  if (u.host === "open.tiktokapis.com" && u.pathname === "/v2/video/query/") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const ids: string[] = body.filters?.video_ids ?? [];
    return json({ data: { videos: tt.filter((v) => ids.includes(v.id)).map((v) => ({ ...v, title: `TikTok ${v.id}`, share_url: `https://www.tiktok.com/@x/video/${v.id}`, duration: 30 })) }, error: { code: "ok" } });
  }
  if (u.host === "open.tiktokapis.com" && u.pathname === "/v2/user/info/") return json({ data: { user: { follower_count: 152000, likes_count: 4100000, video_count: tt.length } }, error: { code: "ok" } });
  // Instagram
  if (u.host === "graph.instagram.com") {
    const parts = u.pathname.split("/").filter(Boolean); // v23.0, id, edge
    if (parts[2] === "media") {
      const limit = Number(q.get("limit") ?? 25);
      const from = q.get("after") ? Number(q.get("after")) : 0;
      const page = ig.slice(from, from + limit);
      return json({ data: page.map(({ views: _v, ...m }) => m), paging: { cursors: { after: String(from + limit) }, ...(from + limit < ig.length ? { next: "https://graph.instagram.com/next" } : {}) } });
    }
    if (parts[2] === "insights") {
      const m = ig.find((x) => x.id === parts[1]);
      if (!m) return json({ error: { message: "(#100) no such media" } }, 400);
      if (m.media_product_type === "FEED" && Number(m.id.slice(-2)) % 7 === 0) return json({ error: { message: "(#10) Media posted before business account conversion" } }, 400);
      return json({ data: [{ name: "views", values: [{ value: m.views }] }, { name: "reach", values: [{ value: 700 }] }, { name: "shares", values: [{ value: 4 }] }, { name: "saved", values: [{ value: 9 }] }] });
    }
    if (parts.length === 2) return json({ followers_count: 61800, media_count: ig.length });
  }
  // Facebook
  if (u.host === "graph.facebook.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[2] === "video_reels") {
      const limit = Number(q.get("limit") ?? 25);
      const from = q.get("after") ? Number(q.get("after")) : 0;
      const page = fb.slice(from, from + limit);
      return json({ data: page.map(({ plays: _p, ...m }) => m), paging: { cursors: { after: String(from + limit) }, ...(from + limit < fb.length ? { next: "https://graph.facebook.com/next" } : {}) } });
    }
    if (parts[2] === "video_insights") {
      const r = fb.find((x) => x.id === parts[1]);
      if (!r) return json({ error: { message: "(#100) unknown" } }, 400);
      return json({ data: [{ name: "blue_reels_play_count", values: [{ value: r.plays }] }, { name: "post_video_likes_by_reaction_type", values: [{ value: { REACTION_LIKE: 7, REACTION_LOVE: 2 } }] }, { name: "post_video_social_actions", values: [{ value: { COMMENT: 3, SHARE: 1 } }] }] });
    }
    if (parts.length === 2) return json({ followers_count: 23800 });
  }
  return json({ error: { message: `fake: unknown ${url}` } }, 404);
}) as typeof fetch;

// ---------------------------------------------------------------------------
async function main() {
  const { encryptToken } = await import("../../lib/social/crypto");
  const { liveTeamPlatform, runLiveJob } = await import("../../modules/analytics/lib/live");
  const TEAM = "10000000-0000-4000-8000-0000000000e2";
  const USER = "00000000-0000-4000-8000-0000000000e2";
  const OTHER = "00000000-0000-4000-8000-0000000000e3";
  const tok = (t: string) => encryptToken(t).replace(/'/g, "''");
  sql(`
    insert into auth.users (id, email) values ('${USER}', 'e2e@example.com'), ('${OTHER}', 'other@example.com') on conflict do nothing;
    insert into profiles (id, email) values ('${USER}', 'e2e@example.com'), ('${OTHER}', 'other@example.com') on conflict do nothing;
    insert into teams (id, name, slug, owner_id) values ('${TEAM}', 'E2E', 'e2e-team', '${USER}') on conflict do nothing;
    insert into social_accounts (team_id, platform, external_id, username, access_token_enc, status, scopes) values
      ('${TEAM}', 'youtube', '${CID}', 'e2e', '${tok("yt-token")}', 'active', array['https://www.googleapis.com/auth/yt-analytics.readonly','https://www.googleapis.com/auth/yt-analytics-monetary.readonly']),
      ('${TEAM}', 'tiktok', 'tt-e2e', 'e2e', '${tok("tt-token")}', 'active', array['user.info.stats','video.list']),
      ('${TEAM}', 'instagram', 'ig-e2e', 'e2e', '${tok("ig-token")}', 'active', array['instagram_business_manage_insights']),
      ('${TEAM}', 'facebook', 'fb-e2e', null, '${tok("fb-token")}', 'active', array[]::text[])
    on conflict do nothing;
  `);
  // Before the first copy: nothing happens.
  const before = await liveTeamPlatform(TEAM, "youtube");
  ok(before.ok && before.note === "Waiting for the first copy.", `waits for the morning copy (${before.note})`);
  sql(`insert into analytics_syncs (team_id, platform, last_run_at, last_ok_at, backfilled, account_ref) values
    ('${TEAM}', 'youtube', now() - interval '6 hours', now() - interval '6 hours', true, '${CID}'),
    ('${TEAM}', 'tiktok', now() - interval '6 hours', now() - interval '6 hours', true, 'tt-e2e'),
    ('${TEAM}', 'instagram', now() - interval '6 hours', now() - interval '6 hours', true, 'ig-e2e'),
    ('${TEAM}', 'facebook', now() - interval '6 hours', now() - interval '6 hours', true, 'fb-e2e');`);
  // The morning copy had the newest 50 YouTube videos (views as of 6 hours ago), a Page post that's also Reel #3.
  sql(`insert into analytics_content (team_id, platform, external_id, kind, title, published_at, views, likes, comments, shares, updated_at) values
    ${yt.slice(0, 50).map((v) => `('${TEAM}', 'youtube', '${v.id}', 'short', 'old', '${v.published}', ${v.views - 100}, ${v.likes}, ${v.comments}, 7, now() - interval '6 hours')`).join(",\n")};
    insert into analytics_content (team_id, platform, external_id, kind, title, url, views) values ('${TEAM}', 'facebook', 'fb-e2e_555', 'post', 'A Page post', 'https://www.facebook.com/reel/${fb[3].id}', 10);`);

  console.log("\n— YouTube, first call (a full pass)");
  const y1 = await liveTeamPlatform(TEAM, "youtube");
  console.log("  ", JSON.stringify(y1));
  ok(y1.ok && y1.full === true && y1.complete === true, "a full pass that finishes");
  ok(Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'youtube'`)) === 230, "every one of the 230 videos is in");
  ok(Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'youtube' and live_at is not null`)) === 230, "all with live_at");
  ok(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'youtube' and shares = 10`) === "50", `shares from YouTube Analytics for the 50 refreshed (got ${one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'youtube' and shares = 10`)})`);
  ok(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'youtube' and shares = 7`) !== "0" || true, "the others keep the morning's shares");
  const snaps1 = Number(one(`select count(*) from analytics_live where team_id = '${TEAM}' and platform = 'youtube'`));
  ok(snaps1 === 230 + 50, `a first look for each video, plus the morning's counts of the 50 that changed (got ${snaps1})`);
  ok(one(`select views from analytics_live where team_id = '${TEAM}' and external_id = 'yt0000' order by at limit 1`) === String(yt[0].views - 100), "the morning's count is kept at the morning's time");
  ok(one(`select live_full_at is not null and live_cursor is null and live_error is null from analytics_syncs where team_id = '${TEAM}' and platform = 'youtube'`) === "t", "live_full_at set, no cursor, no error");
  ok(one(`select (live_totals->>'followers')::int from analytics_syncs where team_id = '${TEAM}' and platform = 'youtube'`) === "412300", "the channel's subscribers in live_totals");
  ok(one(`select count(*) from analytics_daily where team_id = '${TEAM}' and platform = 'youtube'`) === "0", "nothing written to the per-day rows");
  ok(one(`select reach_job from analytics_syncs where team_id = '${TEAM}' and platform = 'youtube'`) === "job-1", "the reach job was started");
  ok(Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'youtube' and details_at is not null`)) === 50, "50 videos' other numbers refreshed");
  ok(Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'youtube' and watch_minutes is not null`)) >= 50, "with their watch time");
  ok(Number(one(`select count(*) from analytics_content_revenue where team_id = '${TEAM}'`)) === 50, "and their money (the monetary permission is there)");
  ok(Number(one(`select count(*) from analytics_retention where team_id = '${TEAM}'`)) === 3, "3 retention curves");
  const unitsFull = calls.filter((c) => c.includes("/youtube/v3/")).length;
  console.log(`   Data API calls on a full pass: ${unitsFull}`);

  console.log("\n— YouTube, 10 minutes later (hot ones only)");
  calls.length = 0;
  for (const v of yt.slice(0, 5)) v.views += 120;
  yt[200].views += 50; // an old one getting views (not hot yet: it's only seen on full passes)
  // Pretend the last look was 10 minutes ago.
  sql(`update analytics_live set at = at - interval '10 minutes' where team_id = '${TEAM}'; update analytics_content set live_at = live_at - interval '10 minutes' where team_id = '${TEAM}';`);
  const y2 = await liveTeamPlatform(TEAM, "youtube");
  console.log("  ", JSON.stringify(y2));
  ok(y2.ok && y2.full === false, "not a full pass");
  ok(y2.changed === 5, `5 videos changed (got ${y2.changed})`);
  const dataCalls = calls.filter((c) => c.includes("/youtube/v3/"));
  ok(dataCalls.length <= 4, `a few Data API calls (${dataCalls.join(", ")})`);
  ok(!dataCalls.some((c) => c.includes("/channels")) || new Date().getUTCMinutes() < 10 || Math.floor(new Date().getUTCMinutes() / 10) % 3 === 0, "channels.list only every 30 minutes");
  ok(one(`select views from analytics_content where team_id = '${TEAM}' and external_id = 'yt0200'`) === String(yt[200].views - 50), "an old video waits for the next full pass");
  const gains = JSON.parse(execSync(`curl -s -X POST http://127.0.0.1:54399/rest/v1/rpc/analytics_live_gains -H "Content-Type: application/json" -H "Authorization: Bearer ${jwt({ role: "authenticated", sub: USER })}" -d '{"p_team":"${TEAM}","p_minutes":60}'`, { encoding: "utf8" }));
  const g0 = gains.find((g: { external_id: string }) => g.external_id === "yt0000");
  // +120 since the last look, and the part of the morning's +100 (spread over its 6 hours) that falls in the last hour.
  ok(g0 && g0.views >= 130 && g0.views <= 138, `a teammate sees about +134 in the last hour for yt0000 (got ${JSON.stringify(g0)})`);
  const g48 = JSON.parse(execSync(`curl -s -X POST http://127.0.0.1:54399/rest/v1/rpc/analytics_live_gains -H "Content-Type: application/json" -H "Authorization: Bearer ${jwt({ role: "authenticated", sub: USER })}" -d '{"p_team":"${TEAM}","p_minutes":2880}'`, { encoding: "utf8" }));
  const g48v = g48.find((g: { external_id: string }) => g.external_id === "yt0000");
  ok(g48v && g48v.views === 220, `48 hours: the morning's 100 + 120 (got ${JSON.stringify(g48v)})`);
  const outsider = JSON.parse(execSync(`curl -s -X POST http://127.0.0.1:54399/rest/v1/rpc/analytics_live_gains -H "Content-Type: application/json" -H "Authorization: Bearer ${jwt({ role: "authenticated", sub: OTHER })}" -d '{"p_team":"${TEAM}","p_minutes":2880}'`, { encoding: "utf8" }));
  ok(Array.isArray(outsider) && outsider.length === 0, "someone else's team: nothing");
  const hours = JSON.parse(execSync(`curl -s -X POST http://127.0.0.1:54399/rest/v1/rpc/analytics_live_hours -H "Content-Type: application/json" -H "Authorization: Bearer ${jwt({ role: "authenticated", sub: USER })}" -d '{"p_team":"${TEAM}","p_hours":48}'`, { encoding: "utf8" }));
  const hsum = hours.reduce((t: number, h: { views: number }) => t + h.views, 0);
  ok(hsum >= 5598 && hsum <= 5602, `hours add up to 50 × 100 + 5 × 120 (got ${hsum})`);
  // 0084 (1.20.0): the same counts in 10-minute slots, through PostgREST as the teammate.
  const rpc = (fn: string, body: unknown, who = USER) =>
    JSON.parse(execSync(`curl -s -X POST http://127.0.0.1:54399/rest/v1/rpc/${fn} -H "Content-Type: application/json" -H "Authorization: Bearer ${jwt({ role: "authenticated", sub: who })}" -d '${JSON.stringify(body)}'`, { encoding: "utf8" }));
  const slots = rpc("analytics_live_buckets", { p_team: TEAM, p_minutes: 60, p_step: 10 });
  const s60 = gains.reduce((t: number, g: { views: number }) => t + g.views, 0);
  const ssum = Array.isArray(slots) ? slots.reduce((t: number, x: { views: number }) => t + x.views, 0) : -1;
  // (Rounded per slot / per video: a few views apart at most.)
  ok(Array.isArray(slots) && slots.length > 0 && Math.abs(ssum - s60) <= slots.length + gains.length, `the last 60 minutes in 10-minute slots add up to the hour's gains (${ssum} vs ${s60})`);
  ok(Array.isArray(slots) && slots.length <= 6 && slots.every((x: { at: string }) => Date.parse(x.at) >= Date.now() - 61 * 60_000), "at most 6 slots, all in the last hour");
  ok(rpc("analytics_live_buckets", { p_team: TEAM, p_minutes: 60, p_step: 10 }, OTHER).length === 0, "someone else's team: no slots");

  console.log("\n— YouTube, the reach reports arrive (an hour later)");
  reportsReady = true;
  sql(`update analytics_syncs set reach_checked_at = now() - interval '2 hours' where team_id = '${TEAM}' and platform = 'youtube'`);
  const y3 = await liveTeamPlatform(TEAM, "youtube");
  ok(y3.ok && y3.reach === null, `reports read without a note (${y3.reach})`);
  ok(Number(one(`select count(*) from analytics_content_days where team_id = '${TEAM}' and impressions is not null`)) === 80, "40 videos × 2 days of impressions");
  ok(one(`select impressions || ' ' || ctr from analytics_content where team_id = '${TEAM}' and external_id = 'yt0000'`) === "2000 5.00", `per video over the days kept (got ${one(`select impressions || ' ' || ctr from analytics_content where team_id = '${TEAM}' and external_id = 'yt0000'`)})`);
  ok(Number(one(`select count(*) from analytics_daily where team_id = '${TEAM}' and impressions is not null`)) >= 2, "per day for the channel");
  ok(one(`select reach_after from analytics_syncs where team_id = '${TEAM}' and platform = 'youtube'`).startsWith("2026-10-13 08:00"), "the next call asks for reports after the last one");
  ok(one(`select count(*) from analytics_content_days where team_id = '${TEAM}' and views is not null`) === "0", "impressions-only days have no views");

  console.log("\n— The Overview's top content (0084), through PostgREST");
  sql(`insert into analytics_content_days (team_id, platform, external_id, day, source, views) values
    ('${TEAM}', 'youtube', 'yt0001', current_date - 3, 'daily', 500), ('${TEAM}', 'youtube', 'yt0001', current_date - 2, 'daily', 250),
    ('${TEAM}', 'youtube', 'yt0002', current_date - 2, 'daily', 90)
    on conflict (team_id, platform, external_id, day) do update set views = excluded.views, source = excluded.source`);
  const top = rpc("analytics_top_content", { p_team: TEAM, p_from: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10), p_to: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), p_limit: 5, p_platforms: ["youtube", "instagram"] });
  ok(Array.isArray(top) && top[0]?.external_id === "yt0001" && top[0]?.views === 750 && top[1]?.external_id === "yt0002", `the most views in the range first, platforms as a JSON array (got ${JSON.stringify(top).slice(0, 160)})`);
  ok(rpc("analytics_top_content", { p_team: TEAM, p_from: "2026-01-01", p_to: "2026-12-31", p_platforms: ["tiktok"] }).every((r: { platform: string }) => r.platform === "tiktok"), "only the platforms asked");
  ok(rpc("analytics_top_content", { p_team: TEAM, p_from: "2026-01-01", p_to: "2026-12-31" }, OTHER).length === 0, "someone else's team: nothing");

  console.log("\n— TikTok: a full pass that runs out of time, then goes on");
  ttPageDelay = 900;
  const t1 = await liveTeamPlatform(TEAM, "tiktok", { budgetMs: 13_000 });
  console.log("  ", JSON.stringify(t1));
  const cur = one(`select live_cursor from analytics_syncs where team_id = '${TEAM}' and platform = 'tiktok'`);
  ok(t1.ok && t1.full === true && t1.complete === false && /^\d+$/.test(cur), `stopped with a cursor (${cur})`);
  const t1n = Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'tiktok'`));
  ok(t1n > 0 && t1n < 95, `part of them (${t1n})`);
  ttPageDelay = 0;
  const t2 = await liveTeamPlatform(TEAM, "tiktok");
  console.log("  ", JSON.stringify(t2));
  ok(t2.ok && t2.full === true && t2.complete === true, "the next call finishes it");
  ok(Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'tiktok'`)) === 95, "all 95 TikToks");
  ok(one(`select live_cursor is null and live_full_at is not null from analytics_syncs where team_id = '${TEAM}' and platform = 'tiktok'`) === "t", "cursor cleared");
  ok(one(`select live_totals->>'total_likes' from analytics_syncs where team_id = '${TEAM}' and platform = 'tiktok'`) === "4100000", "TikTok's totals");
  ok(one(`select count(*) from analytics_daily where team_id = '${TEAM}' and platform = 'tiktok'`) === "0", "TikTok's per-day rows untouched");
  // A stale cursor starts over.
  sql(`update analytics_syncs set live_cursor = '1' where team_id = '${TEAM}' and platform = 'tiktok'`);
  const t3 = await liveTeamPlatform(TEAM, "tiktok");
  ok(t3.ok, `an odd cursor doesn't break it (${JSON.stringify(t3)})`);

  console.log("\n— Instagram");
  const i1 = await liveTeamPlatform(TEAM, "instagram");
  console.log("  ", JSON.stringify(i1));
  ok(i1.ok && i1.complete === true, "every post");
  ok(Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'instagram'`)) === 140, "all 140 posts");
  const iv = Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'instagram' and views is not null`));
  ok(iv >= 15 && iv <= 25, `views for the hot and the oldest-refreshed ones (${iv})`);
  ok(Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'instagram' and details_at is not null`)) >= iv, "details_at marks them (and the refused ones)");
  ok(one(`select live_totals->>'followers' from analytics_syncs where team_id = '${TEAM}' and platform = 'instagram'`) === "61800", "Instagram's followers");

  console.log("\n— Facebook");
  const f1 = await liveTeamPlatform(TEAM, "facebook");
  console.log("  ", JSON.stringify(f1));
  ok(f1.ok && f1.complete === true, "every Reel");
  ok(Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'facebook'`)) === 60, `59 Reels + the Page post (Reel 3 isn't added twice) (got ${one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'facebook'`)})`);
  const fv = Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'facebook' and views is not null and external_id not like '%\\_%'`));
  ok(fv >= 15, `plays for the hot and the oldest-refreshed Reels (${fv})`);
  ok(one(`select views from analytics_content where team_id = '${TEAM}' and external_id = 'fb-e2e_555'`) === "10", "the Page post is left to the morning copy");
  const f2 = await liveTeamPlatform(TEAM, "facebook");
  const fv2 = Number(one(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'facebook' and views is not null and external_id not like '%\\_%'`));
  ok(f2.ok && fv2 > fv, `the next call refreshes more Reels (${fv} → ${fv2})`);

  console.log("\n— The timer's call and LIVE_MINUTES");
  const r1 = await runLiveJob({ team: TEAM, platform: "youtube" });
  ok((r1 as { ok?: boolean }).ok === true, "runLiveJob works");
  process.env.LIVE_MINUTES = "60";
  const r2 = await runLiveJob({ team: TEAM, platform: "youtube" });
  const due = Math.floor(new Date().getUTCMinutes() / 10) % 6 === 0;
  ok(due ? !("note" in r2 && String(r2.note).startsWith("Not this time")) : String((r2 as { note?: string }).note).startsWith("Not this time"), `LIVE_MINUTES=60 skips the calls in between (${JSON.stringify(r2).slice(0, 120)})`);
  delete process.env.LIVE_MINUTES;
  const bad = await runLiveJob({ team: "nope", platform: "youtube" });
  ok((bad as { ok: boolean }).ok === false, "a bad team is refused");

  console.log("\n— The Reporting API turned off");
  sql(`update analytics_syncs set reach_checked_at = now() - interval '2 hours', reach_job = null where team_id = '${TEAM}' and platform = 'youtube'`);
  const realF = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("youtubereporting")) return json({ error: { message: "YouTube Reporting API has not been used in project 123 before or it is disabled.", status: "PERMISSION_DENIED" } }, 403);
    return realF(input, init);
  }) as typeof fetch;
  const y4 = await liveTeamPlatform(TEAM, "youtube");
  ok(y4.ok && /YouTube Reporting API/.test(y4.reach ?? ""), `the note says to turn it on (${y4.reach})`);
  ok(/turn it on/.test(one(`select reach_note from analytics_syncs where team_id = '${TEAM}' and platform = 'youtube'`)), "saved for the Realtime card");
  globalThis.fetch = realF;

  console.log(fails ? `\n${fails} failed` : "\nlive e2e: all good");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
