// YouTube's whole history (1.21.0): the morning copy goes back, a year per
// report, to the channel's first day; a video's page asks for its own story;
// Revenue's chart asks which videos made a day's money; Sync now runs in the
// background. Against a real Postgres + PostgREST with a fake YouTube. Run
// through scripts/e2e/run.sh (after live.e2e.ts).
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

const DB = process.env.E2E_DB_URL ?? "postgres://postgres:postgres@localhost:5432/vplanner_e2e";
const sql = (q: string) => execSync(`psql "${DB}" -qAtX -v ON_ERROR_STOP=1`, { input: q, encoding: "utf8" }).trim();
const one = (q: string) => sql(q).split("\n")[0] ?? "";
let fails = 0;
const ok = (c: boolean, m: string) => (c ? console.log("  ok", m) : (fails++, console.log("FAIL", m)));

// ---------------------------------------------------------------------------
// The fake YouTube: a channel created Jan 27 2025, its first views Feb 3, three
// days in June without any (YouTube leaves such days out), a few videos.
// ---------------------------------------------------------------------------
const CID = "UChistoryhistoryhist";
const BORN = "2025-01-27";
const FIRST = "2025-02-03";
const GAP = ["2025-06-10", "2025-06-11", "2025-06-12"];
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const plus = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
const viewsOn = (d: string) => (d < FIRST || GAP.includes(d) ? 0 : 1000 + (Date.parse(`${d}T00:00:00Z`) / DAY) % 97);
const VIDEOS = [
  { id: "hvA000000001", title: "History A", published: `${plus(iso(Date.now()), -40)}T10:00:00Z`, secs: 40 },
  { id: "hvB000000002", title: "History B", published: `${plus(iso(Date.now()), -300)}T10:00:00Z`, secs: 600 },
  { id: "hvC000000003", title: "History C", published: `${plus(iso(Date.now()), -500)}T10:00:00Z`, secs: 35 },
];
const DIM: Record<string, string[]> = {
  creatorContentType: ["SHORTS", "VIDEO_ON_DEMAND"],
  insightTrafficSourceType: ["SHORTS", "YT_SEARCH", "SUBSCRIBER"],
  insightTrafficSourceDetail: ["detail one", "detail two"],
  deviceType: ["MOBILE", "DESKTOP"],
  operatingSystem: ["ANDROID", "IOS"],
  insightPlaybackLocationType: ["SHORTS", "WATCH"],
  subscribedStatus: ["SUBSCRIBED", "UNSUBSCRIBED"],
  youtubeProduct: ["CORE"],
  country: ["RO", "MD"],
  ageGroup: ["age18-24", "age25-34"],
  gender: ["male", "female"],
  sharingService: ["WHATS_APP"],
  elapsedVideoTimeRatio: ["0.01", "0.5", "1"],
};
const asked: { start: string; end: string; dims: string; filters: string }[] = [];
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("http://127.0.0.1:54399")) return realFetch(input, init);
  const u = new URL(url);
  const q = u.searchParams;
  if (u.host === "www.googleapis.com" && u.pathname === "/youtube/v3/channels")
    return json({ items: [{ snippet: { publishedAt: `${BORN}T09:30:00Z`, title: "History channel" }, statistics: { subscriberCount: "5000", viewCount: "9000000", videoCount: "3" }, contentDetails: { relatedPlaylists: { uploads: `UU${CID.slice(2)}` } } }] });
  if (u.host === "www.googleapis.com" && u.pathname === "/youtube/v3/playlistItems") return json({ items: VIDEOS.map((v) => ({ contentDetails: { videoId: v.id } })) });
  if (u.host === "www.googleapis.com" && u.pathname === "/youtube/v3/videos") {
    const ids = (q.get("id") ?? "").split(",");
    return json({ items: VIDEOS.filter((v) => ids.includes(v.id)).map((v) => ({ id: v.id, snippet: { title: v.title, publishedAt: v.published, thumbnails: { medium: { url: `https://i.ytimg.com/vi/${v.id}/mq.jpg` } } }, statistics: { viewCount: "12345", likeCount: "100", commentCount: "9" }, contentDetails: { duration: `PT${Math.floor(v.secs / 60)}M${v.secs % 60}S` } })) });
  }
  if (u.host === "www.googleapis.com" && (u.pathname === "/youtube/v3/playlists")) return json({ items: [] });
  if (u.host === "youtubeanalytics.googleapis.com") {
    const start = q.get("startDate") ?? "";
    const end = q.get("endDate") ?? "";
    const dims = (q.get("dimensions") ?? "").split(",").filter(Boolean);
    const metrics = (q.get("metrics") ?? "").split(",").filter(Boolean);
    const filters = q.get("filters") ?? "";
    asked.push({ start, end, dims: dims.join(","), filters });
    const ids = (/video==([^;]+)/.exec(filters)?.[1] ?? "").split(",").filter(Boolean);
    // The days asked (only those with views: YouTube leaves the rest out).
    const days: string[] = [];
    if (dims.includes("day")) for (let d = start; d <= end && days.length < 3000; d = plus(d, 1)) if (viewsOn(d) > 0 && d >= BORN) days.push(d);
    const valuesOf = (dim: string) => (dim === "day" ? days : dim === "video" ? (ids.length ? ids : VIDEOS.map((v) => v.id)) : DIM[dim] ?? ["x"]);
    let combos: string[][] = [[]];
    for (const dim of dims) combos = combos.flatMap((c) => valuesOf(dim).map((v) => [...c, v]));
    const rows = combos.map((c) => {
      const day = dims.includes("day") ? c[dims.indexOf("day")] : null;
      const base = day ? viewsOn(day) : 50_000;
      const share = 1 / Math.max(1, combos.length / Math.max(1, days.length || 1));
      return [
        ...c,
        ...metrics.map((m) =>
          m === "averageViewPercentage" ? 55 : m === "averageViewDuration" ? 31 : m === "viewerPercentage" ? 25 : m === "estimatedRevenue" ? Math.round(base * share) / 1000 : m === "subscribersGained" ? 3 : m.endsWith("Rate") ? 0.5 : Math.round(base * share)
        ),
      ];
    });
    return json({ columnHeaders: [...dims, ...metrics].map((name) => ({ name })), rows });
  }
  return json({ error: { message: `fake: unknown ${url}` } }, 404);
}) as typeof fetch;

const rpc = (fn: string, body: unknown, who: string) =>
  JSON.parse(execSync(`curl -s -X POST http://127.0.0.1:54399/rest/v1/rpc/${fn} -H "Content-Type: application/json" -H "Authorization: Bearer ${jwt({ role: "authenticated", sub: who })}" -d '${JSON.stringify(body)}'`, { encoding: "utf8" }));

async function main() {
  const { encryptToken } = await import("../../lib/social/crypto");
  const { syncTeamAnalytics, fetchYouTubeVideoDetails, fetchYouTubeRevenueVideos } = await import("../../modules/analytics/lib/sync");
  const { adoptAccount } = await import("../../modules/analytics/lib/accounts");
  const { createAdminClient } = await import("../../lib/supabase/admin");
  const TEAM = "10000000-0000-4000-8000-0000000000f5";
  const USER = "00000000-0000-4000-8000-0000000000f5";
  const EDITOR = "00000000-0000-4000-8000-0000000000f6";
  const tok = (t: string) => encryptToken(t).replace(/'/g, "''");
  sql(`
    insert into auth.users (id, email) values ('${USER}', 'h@example.com'), ('${EDITOR}', 'he@example.com') on conflict do nothing;
    insert into profiles (id, email) values ('${USER}', 'h@example.com'), ('${EDITOR}', 'he@example.com') on conflict do nothing;
    insert into teams (id, name, slug, owner_id) values ('${TEAM}', 'History', 'history-team', '${USER}') on conflict do nothing;
    insert into team_members (id, team_id, user_id, invited_email, status) values ('20000000-0000-4000-8000-0000000000f6', '${TEAM}', '${EDITOR}', 'he@example.com', 'active') on conflict do nothing;
    insert into member_roles (team_member_id, role) values ('20000000-0000-4000-8000-0000000000f6', 'editor') on conflict do nothing;
    insert into social_accounts (team_id, platform, external_id, username, access_token_enc, status, scopes) values
      ('${TEAM}', 'youtube', '${CID}', 'history', '${tok("yt-token")}', 'active', array['https://www.googleapis.com/auth/yt-analytics.readonly','https://www.googleapis.com/auth/yt-analytics-monetary.readonly'])
    on conflict do nothing;
  `);
  const today = iso(Date.now());
  const yt = (q: string) => one(`select ${q} from analytics_daily where team_id = '${TEAM}' and platform = 'youtube' and content = 'all'`);

  console.log("\n— The first copy: 90 days, then the history back to the channel's first views");
  const r1 = await syncTeamAnalytics(TEAM, { only: "youtube" });
  console.log("  ", JSON.stringify(r1));
  ok(r1[0]?.ok === true, "the copy went fine");
  ok(yt("min(day)") === FIRST, `Lifetime starts on the first day with views, not 90 days ago (got ${yt("min(day)")})`);
  ok(one(`select history_done || ' ' || history_from from analytics_syncs where team_id = '${TEAM}' and platform = 'youtube'`) === `true ${BORN}`, `history done, back to the channel's first day (got ${one(`select history_done || ' ' || history_from from analytics_syncs where team_id = '${TEAM}' and platform = 'youtube'`)})`);
  const span = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${FIRST}T00:00:00Z`)) / DAY) + 1;
  ok(Number(yt("count(*)")) === span, `every day from the first to today (${yt("count(*)")} of ${span})`);
  ok(sql(`select views from analytics_daily where team_id = '${TEAM}' and platform = 'youtube' and content = 'all' and day in ('${GAP.join("','")}') order by day`) === "0\n0\n0", "the days YouTube left out are zeros");
  ok(Number(one(`select count(*) from analytics_daily where team_id = '${TEAM}' and platform = 'youtube' and content = 'shorts' and day < '${plus(today, -100)}'`)) > 200, "Shorts vs long videos go back too");
  ok(one(`select min(day) from analytics_revenue_daily where team_id = '${TEAM}' and platform = 'youtube'`) === FIRST, "and the money");
  ok(Number(one(`select count(*) from analytics_breakdowns where team_id = '${TEAM}' and platform = 'youtube' and span = 1 and day < '${plus(today, -100)}'`)) > 1000, "and how views split per day (traffic sources, devices…)");
  ok(Number(one(`select count(*) from analytics_breakdowns where team_id = '${TEAM}' and platform = 'youtube' and external_id = '' and span = 0 and dimension = 'country'`)) === 2, "the channel's whole-life countries (Lifetime's map)");
  ok(Number(one(`select count(*) from analytics_breakdowns where team_id = '${TEAM}' and platform = 'youtube' and external_id = '' and span = 365 and dimension = 'country'`)) === 2, "and a year's");
  const reports = asked.filter((a) => a.dims === "day" && !a.filters && a.start < plus(today, -100));
  ok(reports.length > 0 && reports.every((a) => Math.round((Date.parse(a.end) - Date.parse(a.start)) / DAY) + 1 <= 365), `a year per report at most (${reports.map((a) => `${a.start}…${a.end}`).join(", ")})`);
  ok(reports.some((a) => a.start === BORN), "the last one starts on the channel's first day");

  console.log("\n— The next copy: no history again");
  asked.length = 0;
  const r2 = await syncTeamAnalytics(TEAM, { only: "youtube" });
  ok(r2[0]?.ok === true, "the copy went fine");
  ok(!asked.some((a) => a.start < plus(today, -60) && a.dims.startsWith("day") && !a.filters), `nothing older than the last days asked (${asked.filter((a) => a.start < plus(today, -60)).length})`);

  console.log("\n— A video's own story (its analytics page)");
  const saved = await fetchYouTubeVideoDetails(TEAM, VIDEOS[0].id);
  ok(saved > 0, `saved (${saved} rows)`);
  const dims = sql(`select distinct dimension from analytics_breakdowns where team_id = '${TEAM}' and external_id = '${VIDEOS[0].id}' and span = 0 order by 1`).split("\n");
  ok(["age_gender", "country", "device", "external_site", "os", "playback_location", "playlist", "search_term", "sharing", "subscribed", "suggested_by", "traffic_source"].every((d) => dims.includes(d)), `every split (${dims.join(", ")})`);
  ok(one(`select value from analytics_breakdowns where team_id = '${TEAM}' and external_id = '${VIDEOS[0].id}' and dimension = 'subscribed' and key = 'SUBSCRIBED'`) === "55.0000", "subscribers' average % viewed");
  const vd = sql(`select count(*), count(subscribers_gained), count(avg_view_seconds), min(day) from analytics_content_days where team_id = '${TEAM}' and external_id = '${VIDEOS[0].id}' and source = 'daily'`);
  ok(/^4[01]\|4[01]\|4[01]\|/.test(vd.replace(/\n/g, "")), `its days since it was posted, with subscribers and the average view (${vd})`);
  const again = await fetchYouTubeVideoDetails(TEAM, VIDEOS[0].id);
  ok(again > 0 && one(`select count(*) from analytics_breakdowns where team_id = '${TEAM}' and external_id = '${VIDEOS[0].id}' and dimension = 'device'`) === "2", "asked again: replaced, not added");

  console.log("\n— Which videos made a day's money");
  const money = await fetchYouTubeRevenueVideos(TEAM, plus(today, -3), plus(today, -3), "USD");
  ok(Array.isArray(money) && money.length === 3 && money.every((m) => m.title?.startsWith("History") && m.revenue > 0), `titles and revenue (${JSON.stringify(money).slice(0, 160)})`);
  ok(asked.some((a) => a.dims === "video" && a.start === plus(today, -3) && a.end === plus(today, -3)), "asked for that day only");

  console.log("\n— Sync now (0085), through PostgREST");
  const editor = rpc("analytics_sync_now", { p_team: TEAM }, EDITOR);
  ok(editor?.code === "42501", `an editor can't (${JSON.stringify(editor).slice(0, 120)})`);
  const master = rpc("analytics_sync_now", { p_team: TEAM }, USER);
  ok(master === 0, `a master can; without the timer's secrets nothing is sent (got ${JSON.stringify(master)})`);

  console.log("\n— Another account takes over: the history starts over");
  const admin = createAdminClient();
  const adopted = await adoptAccount(admin, TEAM, "youtube", { externalId: "UCanotheranotherano", name: "another" });
  ok(adopted.purged, "the old numbers are gone");
  ok(one(`select coalesce(history_from::text, 'none') || ' ' || history_done from analytics_syncs where team_id = '${TEAM}' and platform = 'youtube'`) === "none false", "history_from and history_done reset");

  console.log(fails ? `\n${fails} failed` : "\nyoutube history e2e: all good");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
