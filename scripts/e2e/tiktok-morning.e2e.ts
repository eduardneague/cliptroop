// The TikTok morning copy (1.19.0): every video, yesterday's views worked out
// per video. Run through scripts/e2e/run.sh (after live.e2e.ts).
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
let fails = 0;
const ok = (c: boolean, m: string) => (c ? console.log("  ok", m) : (fails++, console.log("FAIL", m)));
const H = 3_600_000;
const tt = Array.from({ length: 260 }, (_, i) => ({ id: `${8000000000 + i}`, view_count: 10_000 + i, like_count: 20, comment_count: 2, share_count: 1, create_time: Math.floor((Date.now() - (i + 1) * 20 * H) / 1000) }));
// One posted 2 hours ago (after yesterday's copy).
tt.unshift({ id: "8999999999", view_count: 777, like_count: 1, comment_count: 0, share_count: 0, create_time: Math.floor((Date.now() - 2 * H) / 1000) });
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("http://127.0.0.1:54399")) return realFetch(input, init);
  const u = new URL(url);
  if (u.pathname === "/v2/user/info/") return json({ data: { user: { follower_count: 150000, likes_count: 4000000, video_count: tt.length } }, error: { code: "ok" } });
  if (u.pathname === "/v2/video/list/") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const from = body.cursor ? tt.findIndex((v) => v.create_time * 1000 < body.cursor) : 0;
    const page = tt.slice(from, from + 20);
    return json({ data: { videos: page.map((v) => ({ ...v, title: `T ${v.id}`, share_url: `https://www.tiktok.com/@x/video/${v.id}`, duration: 20 })), cursor: page.length ? page[page.length - 1].create_time * 1000 : 0, has_more: from + 20 < tt.length }, error: { code: "ok" } });
  }
  return new Response(JSON.stringify({ error: { message: "unknown " + url } }), { status: 404 });
}) as typeof fetch;

async function main() {
  const TEAM = "10000000-0000-4000-8000-0000000000e2";
  const { syncTeamAnalytics } = await import("../../modules/analytics/lib/sync");
  // Yesterday's copy had the newest 200 (each 100 views fewer than now); the 60 oldest weren't copied.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  sql(`delete from analytics_content where team_id = '${TEAM}' and platform = 'tiktok';
       delete from analytics_content_days where team_id = '${TEAM}' and platform = 'tiktok';
       delete from analytics_daily where team_id = '${TEAM}' and platform = 'tiktok';
       insert into analytics_content_days (team_id, platform, external_id, day, source, views, updated_at) values
       ${tt.slice(1, 201).map((v) => `('${TEAM}', 'tiktok', '${v.id}', '${yesterday}', 'total', ${v.view_count - 100}, now() - interval '20 hours')`).join(",")};
       insert into analytics_daily (team_id, platform, day, content, total_views) values ('${TEAM}', 'tiktok', '${yesterday}', 'all', 1234567);`);
  const r = await syncTeamAnalytics(TEAM, { only: "tiktok" });
  console.log("  ", JSON.stringify(r));
  ok(r[0]?.ok === true, "the copy went fine");
  ok(sql(`select count(*) from analytics_content where team_id = '${TEAM}' and platform = 'tiktok'`) === "261", "every one of the 261 TikToks");
  const yv = sql(`select views from analytics_daily where team_id = '${TEAM}' and platform = 'tiktok' and day = '${yesterday}' and content = 'all'`);
  ok(yv === String(200 * 100 + 777), `yesterday: 200 videos × 100 + the new one's 777 (the 60 found for the first time add nothing) (got ${yv})`);
  const today = new Date().toISOString().slice(0, 10);
  const tv = sql(`select total_views from analytics_daily where team_id = '${TEAM}' and platform = 'tiktok' and day = '${today}' and content = 'all'`);
  ok(tv === String(tt.reduce((t, v) => t + v.view_count, 0)), `today's lifetime views from a complete read (got ${tv})`);
  ok(sql(`select count(*) from analytics_content_days where team_id = '${TEAM}' and platform = 'tiktok' and day = '${today}' and source = 'total'`) === "261", "today's per-video copy for all of them");
  console.log(fails ? `\n${fails} failed` : "\ntiktok morning e2e: all good");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
