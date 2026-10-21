// Outliers' collector (1.27.0) against a real Postgres + PostgREST with a fake
// YouTube: a niche fills in (searches, channels, scores, relevance,
// insights), the explore niches, what teammates and outsiders can read, the
// daily budget, tracked-channel alerts, live searches (and their limits),
// adding a channel by its link, a video's fresh numbers, thumbnails, and
// YouTube's 30 days; since 1.29.0 also which found channels count (a cooking
// channel with one phone video doesn't), finding channels by name or handle,
// a niche's own channels ("only these"), and a channel the team hid.
// Run through scripts/e2e/run.sh.
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { encode } from "jpeg-js";

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
delete process.env.YOUTUBE_API_KEY;

const DB = process.env.E2E_DB_URL ?? "postgres://postgres:postgres@localhost:5432/vplanner_e2e";
const sql = (q: string) => execSync(`psql "${DB}" -qAtX -v ON_ERROR_STOP=1`, { input: q, encoding: "utf8" }).trim();
const one = (q: string) => sql(q).split("\n")[0] ?? "";
let fails = 0;
const ok = (c: boolean, m: string) => (c ? console.log("  ok", m) : (fails++, console.log("FAIL", m)));

// ---------------------------------------------------------------------------
// The fake YouTube: 14 tech channels, each with long videos and Shorts, a few
// huge outliers, one channel without a Shorts list, one without its long list,
// one that features two channels the searches never find.
// ---------------------------------------------------------------------------
const DAY = 86_400_000;
const NOW = Date.now();
const cid = (i: number) => `UC${`fake${String(i).padStart(2, "0")}`.padEnd(22, "x")}`;
const vid = (c: number, i: number, k: string) => `${k}${String(c).padStart(2, "0")}${String(i).padStart(3, "0")}`.padEnd(11, "z");
type V = { id: string; channel: string; title: string; publishedAt: string; secs: number; views: number; likes: number; comments: number; short: boolean; tags: string[] };
type C = { id: string; title: string; handle: string; subs: number; noShorts?: boolean; noLong?: boolean; featured?: string[] };
const TITLES = ["I Tested a $200 Fake {T}", "{T} Review", "Real vs Fake {T}: Can You Tell?", "I Bought the Cheapest {T} on Amazon", "{T} Unboxing", "Is the {T} Worth It?", "10 {T} Tips", "The Truth About the {T}", "$50 vs $1,000 {T}", "My {T} Setup"];
const TOPICS = ["iPhone 17", "Galaxy S26", "Pixel 10", "AirPods", "iPad", "phone"];
const CHANNELS: C[] = Array.from({ length: 16 }, (_, i) => ({ id: cid(i), title: `Phone Lab ${i}`, handle: `@phonelab${i}`, subs: 50_000 * (i + 1) }));
CHANNELS[3].noShorts = true;
CHANNELS[4].noLong = true;
CHANNELS[13].featured = [cid(14), cid(15)];
// 14 and 15 aren't in any search: only the featured list leads to them.
const VIDEOS: V[] = [];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let c = 0; c < CHANNELS.length; c++) {
  const ch = CHANNELS[c];
  for (let i = 0; i < 40; i++) {
    const tpl = TITLES[i % TITLES.length];
    const topic = TOPICS[(i + c) % TOPICS.length];
    const fakeBoost = /Fake|\$50 vs/.test(tpl) ? 6 : 1;
    const base = ch.subs * 0.3;
    VIDEOS.push({ id: vid(c, i, "L"), channel: ch.id, title: tpl.replace("{T}", topic), publishedAt: new Date(NOW - (i * 6 + 3) * DAY).toISOString(), secs: 600 + i * 7, views: Math.round(base * fakeBoost * (0.6 + rnd())), likes: 100 + i, comments: 10 + i, short: false, tags: ["phone", topic.toLowerCase()] });
  }
  for (let i = 0; i < 20; i++) {
    VIDEOS.push({ id: vid(c, i, "S"), channel: ch.id, title: `${TOPICS[i % TOPICS.length]} trick #shorts`, publishedAt: new Date(NOW - (i * 3 + 1) * DAY).toISOString(), secs: 40, views: Math.round(ch.subs * 0.5 * (0.6 + rnd())), likes: 50, comments: 5, short: true, tags: [] });
  }
}
// Off-topic: a cooking channel that once made a phone video (the searches find it; it isn't about phones).
const COOK: C = { id: cid(90), title: "Grandma Cooks", handle: "@grandma", subs: 900_000 };
CHANNELS.push(COOK);
for (let i = 0; i < 30; i++) VIDEOS.push({ id: vid(90, i, "L"), channel: COOK.id, title: i === 0 ? "I Tested a $200 Fake iPhone 17 for Recipes" : `Pasta recipe number ${i}`, publishedAt: new Date(NOW - (i * 5 + 2) * DAY).toISOString(), secs: 700, views: 200_000, likes: 10, comments: 1, short: false, tags: ["cooking"] });

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const calls: string[] = [];
const realFetch = globalThis.fetch;
const pic = (rgb: [number, number, number], w: number, h: number) => {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const left = x < w / 2;
      data[i] = left ? rgb[0] : 255 - rgb[0];
      data[i + 1] = left ? rgb[1] : 255 - rgb[1];
      data[i + 2] = left ? rgb[2] : 255 - rgb[2];
      data[i + 3] = 255;
    }
  return encode({ width: w, height: h, data }, 80).data;
};
const itemOf = (v: V, player: boolean) => ({
  id: v.id,
  snippet: { publishedAt: v.publishedAt, channelId: v.channel, title: v.title, description: "0:00 Intro\n1:00 Tests\n5:00 Verdict", tags: v.tags, categoryId: "28", liveBroadcastContent: "none", defaultAudioLanguage: "en" },
  contentDetails: { duration: `PT${Math.floor(v.secs / 60)}M${v.secs % 60}S`, definition: "hd", caption: "false", licensedContent: true },
  statistics: { viewCount: String(v.views), likeCount: String(v.likes), commentCount: String(v.comments) },
  status: { madeForKids: false },
  ...(player ? { player: v.short ? { embedWidth: "203", embedHeight: "360" } : { embedWidth: "360", embedHeight: "203" } } : {}),
});
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("http://127.0.0.1:54399")) return realFetch(input, init);
  const u = new URL(url);
  const q = u.searchParams;
  if (u.host === "i.ytimg.com") {
    const id = u.pathname.split("/")[2] ?? "";
    const n = [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
    const big = u.pathname.endsWith("hqdefault.jpg");
    return new Response(new Uint8Array(pic([n % 255, (n * 3) % 255, (n * 7) % 255], big ? 480 : 320, big ? 360 : 180)), { headers: { "Content-Type": "image/jpeg" } });
  }
  if (u.host !== "www.googleapis.com") return json({ error: { message: `fake: unknown ${url}` } }, 404);
  const path = u.pathname.replace("/youtube/v3/", "");
  calls.push(path);
  if (q.get("key") !== "test-key" && !init?.headers) return json({ error: { message: "no key", errors: [{ reason: "forbidden" }] } }, 403);
  if (path === "search") {
    const words = (q.get("q") ?? "").toLowerCase().split(/\s+/);
    const after = q.get("publishedAfter") ? Date.parse(q.get("publishedAfter")!) : 0;
    let found = VIDEOS.filter((v) => words.every((w) => v.title.toLowerCase().includes(w) || v.tags.join(" ").includes(w)) && Date.parse(v.publishedAt) >= after && !["14", "15"].some((n) => v.channel === cid(Number(n))));
    if (q.get("videoDuration") === "short") found = found.filter((v) => v.secs < 240);
    found.sort((a, b) => (q.get("order") === "date" ? b.publishedAt.localeCompare(a.publishedAt) : b.views - a.views));
    return json({ items: found.slice(0, 50).map((v) => ({ id: { kind: "youtube#video", videoId: v.id } })) });
  }
  if (path === "videos") {
    const ids = (q.get("id") ?? "").split(",");
    const player = (q.get("part") ?? "").includes("player");
    const stats = (q.get("part") ?? "") === "statistics";
    return json({ items: VIDEOS.filter((v) => ids.includes(v.id)).map((v) => (stats ? { id: v.id, statistics: itemOf(v, false).statistics } : itemOf(v, player))) });
  }
  if (path === "videos:batchGetStats") {
    const ids = (q.get("id") ?? "").split(",");
    return json({ items: VIDEOS.filter((v) => ids.includes(v.id)).map((v) => ({ kind: "youtube#videoStats", id: v.id, statistics: { viewCount: String(v.views), likeCount: String(v.likes), commentCount: String(v.comments) } })) });
  }
  if (path === "channels") {
    const ids = (q.get("id") ?? "").split(",");
    const handle = q.get("forHandle");
    const list = CHANNELS.filter((c) => ids.includes(c.id) || (handle && c.handle.toLowerCase() === handle.toLowerCase()));
    return json({ items: list.map((c) => ({ id: c.id, snippet: { title: c.title, customUrl: c.handle, publishedAt: "2020-01-01T00:00:00Z", thumbnails: { medium: { url: "https://yt3.ggpht.com/x=s240-c" } }, country: "US" }, statistics: { subscriberCount: String(c.subs), viewCount: "1000000", videoCount: "60", hiddenSubscriberCount: false }, contentDetails: { relatedPlaylists: { uploads: `UU${c.id.slice(2)}` } }, brandingSettings: { channel: { keywords: "phones tech" } } })) });
  }
  if (path === "playlistItems") {
    const pid = q.get("playlistId") ?? "";
    const tail = pid.replace(/^(UULF|UUSH|UU)/, "");
    const ch = CHANNELS.find((c) => c.id.slice(2) === tail);
    if (!ch) return json({ error: { message: "playlistNotFound", errors: [{ reason: "playlistNotFound" }] } }, 404);
    const mine = VIDEOS.filter((v) => v.channel === ch.id).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const max = Number(q.get("maxResults") ?? 50);
    let list: V[];
    if (pid.startsWith("UULF")) {
      if (ch.noLong) return json({ error: { message: "playlistNotFound", errors: [{ reason: "playlistNotFound" }] } }, 404);
      list = mine.filter((v) => !v.short);
    } else if (pid.startsWith("UUSH")) {
      if (ch.noShorts || ch.noLong) return json({ error: { message: "playlistNotFound", errors: [{ reason: "playlistNotFound" }] } }, 404);
      list = mine.filter((v) => v.short);
    } else list = mine;
    return json({ items: list.slice(0, max).map((v) => ({ contentDetails: { videoId: v.id } })) });
  }
  if (path === "channelSections") {
    const ch = CHANNELS.find((c) => c.id === q.get("channelId"));
    return json({ items: ch?.featured ? [{ snippet: { type: "multipleChannels" }, contentDetails: { channels: ch.featured } }] : [] });
  }
  return json({ error: { message: `fake: unknown ${url}` } }, 404);
}) as typeof fetch;

const as = (who: string) => `Authorization: Bearer ${jwt({ role: "authenticated", sub: who })}`;
const rpc = (fn: string, body: unknown, who: string) => JSON.parse(execSync(`curl -s -X POST http://127.0.0.1:54399/rest/v1/rpc/${fn} -H "Content-Type: application/json" -H "${as(who)}" -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`, { encoding: "utf8" }));
const rest = (path: string, who: string) => JSON.parse(execSync(`curl -s "http://127.0.0.1:54399/rest/v1/${path}" -H "${as(who)}"`, { encoding: "utf8" }));

async function main() {
  const { runOutliersJob } = await import("../../modules/outliers/lib/collector");
  const { liveSearch, addChannelByRef, refreshVideo, findChannels, addToNiche } = await import("../../modules/outliers/lib/requests");
  const TEAM = "10000000-0000-4000-8000-0000000000a7";
  const OTHER = "10000000-0000-4000-8000-0000000000b7";
  const M = "00000000-0000-4000-8000-0000000000a7";
  const R = "00000000-0000-4000-8000-0000000000a8";
  const E = "00000000-0000-4000-8000-0000000000a9";
  const O = "00000000-0000-4000-8000-0000000000b7";
  sql(`
    insert into auth.users (id, email) values ('${M}', 'm7@example.com'), ('${R}', 'r7@example.com'), ('${E}', 'e7@example.com'), ('${O}', 'o7@example.com') on conflict do nothing;
    insert into profiles (id, email) values ('${M}', 'm7@example.com'), ('${R}', 'r7@example.com'), ('${E}', 'e7@example.com'), ('${O}', 'o7@example.com') on conflict do nothing;
    insert into teams (id, name, slug, owner_id) values ('${TEAM}', 'Phones', 'phones-team', '${M}'), ('${OTHER}', 'Other', 'other-team', '${O}') on conflict do nothing;
    insert into team_members (id, team_id, user_id, invited_email, status) values
      ('20000000-0000-4000-8000-0000000000a8', '${TEAM}', '${R}', 'r7@example.com', 'active'),
      ('20000000-0000-4000-8000-0000000000a9', '${TEAM}', '${E}', 'e7@example.com', 'active') on conflict do nothing;
    insert into member_roles (team_member_id, role) values ('20000000-0000-4000-8000-0000000000a8', 'researcher'), ('20000000-0000-4000-8000-0000000000a9', 'editor') on conflict do nothing;
  `);
  const NICHE = "30000000-0000-4000-8000-0000000000a7";
  sql(`insert into outlier_niches (id, team_id, name, keywords, kinds) values ('${NICHE}', '${TEAM}', 'Phones', array['fake iphone', 'phone review', 'iphone 17'], array['long','short']) on conflict do nothing;`);

  console.log("\n— Nothing to read YouTube with yet");
  const none = await runOutliersJob({ team: TEAM });
  ok(!!none.skipped && /YouTube/.test(none.skipped), `skipped, saying why (${none.skipped})`);
  ok(one(`select crawl->>'note' from outlier_niches where id = '${NICHE}'`) === "no-access", "the niche says it can't read YouTube");

  process.env.YOUTUBE_API_KEY = "test-key";
  console.log("\n— The first run fills the niche");
  const r1 = await runOutliersJob({ team: TEAM, niche: NICHE, budgetMs: 50_000 });
  console.log("   ", JSON.stringify(r1));
  ok(r1.ok && r1.searches >= 3 && r1.searches <= 6, `searched (${r1.searches})`);
  ok(Number(one(`select count(*) from yt_videos`)) > 400, `videos saved (${one(`select count(*) from yt_videos`)})`);
  ok(Number(one(`select count(*) from outlier_niche_channels where niche_id = '${NICHE}'`)) >= 12, `channels joined the niche (${one(`select count(*) from outlier_niche_channels where niche_id = '${NICHE}'`)})`);
  ok(r1.scanned >= 10, `channels read (${r1.scanned})`);
  ok(Number(one(`select count(*) from yt_videos where score is not null`)) > 300, "scores worked out");
  ok(one(`select kind from yt_videos where id = '${vid(1, 0, "S")}'`) === "short" && one(`select kind from yt_videos where id = '${vid(1, 0, "L")}'`) === "long", "Shorts and long videos told apart by their lists");
  ok(one(`select kind from yt_videos where id = '${vid(4, 0, "S")}'`) === "short", "a channel without separate lists: told apart by length and shape");
  ok(Number(one(`select long_median from yt_channels where id = '${cid(1)}'`)) > 0 && Number(one(`select short_median from yt_channels where id = '${cid(1)}'`)) > 0, "each channel's usual, long and Shorts apart");
  const fakeScore = Number(one(`select avg(score) from yt_videos where title like '%Fake%' and channel_id <> '${COOK.id}'`));
  const reviewScore = Number(one(`select avg(score) from yt_videos where title like '%Review%'`));
  ok(fakeScore > reviewScore * 2, `the fake videos are the outliers (${fakeScore.toFixed(2)} vs ${reviewScore.toFixed(2)})`);
  ok(Number(one(`select relevance from outlier_niche_channels where niche_id = '${NICHE}' and channel_id = '${cid(1)}'`)) > 0.3, "a phone channel is about the niche");
  // 1.29.0: it doesn't count (not checked until its uploads are read, then off topic).
  const cook = one(`select coalesce(verdict, 'not checked') from outlier_niche_channels where niche_id = '${NICHE}' and channel_id = '${COOK.id}'`);
  ok(cook !== "ok", `the cooking channel isn't (${cook})`);
  ok(one(`select insights is not null from outlier_niches where id = '${NICHE}'`) === "t", "insights saved");
  // Long videos and Shorts each have their own (the combined set only when one kind has too few).
  const fmt = `coalesce(insights->'long', insights->'all')->'formats'->0->>'id'`;
  ok(one(`select ${fmt} from outlier_niches where id = '${NICHE}'`) !== "", `formats found (${one(`select ${fmt} from outlier_niches where id = '${NICHE}'`)})`);
  ok(Number(one(`select (crawl->'counts'->>'videos')::int from outlier_niches where id = '${NICHE}'`)) > 300, "the niche's counts");
  ok(Number(one(`select count(*) from yt_videos where thumb_hash is not null`)) > 0, `thumbnails looked at (${one(`select count(*) from yt_videos where thumb_hash is not null`)})`);
  ok(Number(one(`select count(*) from yt_videos where chapters = 3`)) > 0, "chapters counted");
  const usedUnits = Number(one(`select used from outlier_quota where bucket = 'units'`));
  ok(usedUnits === r1.units && usedUnits <= 900, `the budget counted every call (${usedUnits} = ${r1.units})`);

  console.log("\n— What people can read");
  const list = rpc("outliers_videos", { p_team: TEAM, p_niche: NICHE, p_f: { kind: "long" }, p_sort: "score", p_limit: 10, p_offset: 0 }, E);
  ok(Array.isArray(list) && list.length === 10, `a teammate gets the niche's videos (${Array.isArray(list) ? list.length : JSON.stringify(list)})`);
  ok(Array.isArray(list) && list[0].score >= list[9].score && /Fake|\$50/.test(list[0].title), `best first (${list[0]?.title} ${list[0]?.score})`);
  ok(Array.isArray(list) && Array.isArray(list[0].peers) && list[0].peers.length >= 3 && typeof list[0].peer_i === "number", "with the channel's videos around it");
  ok(Number(list[0]?.total) > 100, `and how many there are (${list[0]?.total})`);
  ok(!list.some((v: { channel_id: string; title: string }) => v.channel_id === COOK.id && v.title.startsWith("Pasta")), "the cooking channel's recipes aren't in the niche");
  const filtered = rpc("outliers_videos", { p_team: TEAM, p_niche: NICHE, p_f: { min_score: 3, q: "fake", days: 120 }, p_sort: "views", p_limit: 50, p_offset: 0 }, E);
  ok(Array.isArray(filtered) && filtered.length > 0 && filtered.every((v: { title: string; score: number }) => /fake/i.test(v.title) && v.score >= 3), `filters: words, score, days (${filtered.length})`);
  const shorts = rpc("outliers_videos", { p_team: TEAM, p_niche: null, p_f: { kind: "short" }, p_sort: "newest", p_limit: 5, p_offset: 0 }, R);
  ok(Array.isArray(shorts) && shorts.length === 5 && shorts.every((v: { kind: string }) => v.kind === "short"), "Shorts only, every niche");
  ok(JSON.stringify(rpc("outliers_videos", { p_team: TEAM, p_niche: NICHE, p_f: {}, p_sort: "score", p_limit: 5, p_offset: 0 }, O)) === "[]", "someone from another team gets nothing");
  ok(JSON.stringify(rpc("outliers_videos", { p_team: OTHER, p_niche: NICHE, p_f: {}, p_sort: "score", p_limit: 5, p_offset: 0 }, O)) === "[]", "not even through their own team");
  const chans = rpc("outliers_channels", { p_team: TEAM, p_niche: NICHE, p_f: {}, p_sort: "rate", p_limit: 50, p_offset: 0 }, E);
  ok(Array.isArray(chans) && chans.length >= 10 && chans[0].stored > 0, `the niche's channels with their numbers (${chans.length})`);
  const detail = rpc("outliers_video", { p_team: TEAM, p_video: list[0].id }, E);
  ok(detail?.video?.id === list[0].id && Array.isArray(detail.peers) && detail.peers.length > 5 && detail.niches.includes(NICHE), "one video's panel");
  ok(rpc("outliers_video", { p_team: TEAM, p_video: list[0].id }, O) === null, "not for outsiders");
  const ch = rpc("outliers_channel", { p_team: TEAM, p_channel: cid(2) }, E);
  ok(ch?.channel?.id === cid(2) && ch.videos.length > 20, "one channel's panel");
  const ov = rpc("outliers_overview", { p_team: TEAM }, E);
  ok(ov?.niches?.length === 1 && ov.niches[0].counts?.videos > 0, "the overview");
  ok(rest("yt_videos?select=id&limit=1", E).length === 1 && rest("yt_videos?select=id&limit=1", O).length === 1, "YouTube's public data: anyone on a team reads it");
  ok(rest(`outlier_niches?select=id&team_id=eq.${TEAM}`, O).length === 0, "another team's niches aren't");

  console.log("\n— The second run doesn't repeat itself");
  const before = calls.filter((c) => c === "search").length;
  const r2 = await runOutliersJob({ team: TEAM });
  console.log("   ", JSON.stringify(r2));
  const keys = Object.keys(JSON.parse(one(`select crawl->'searches' from outlier_niches where id = '${NICHE}'`)));
  ok(new Set(keys).size === keys.length && r2.searches <= 3, `searches spread out (${r2.searches} this time, ${keys.length} done)`);
  ok(calls.filter((c) => c === "search").length - before === r2.searches, "and counted");
  ok(Number(one(`select count(*) from outlier_niche_channels where niche_id = '${NICHE}' and source = 'featured'`)) >= 1, `featured channels joined (${one(`select count(*) from outlier_niche_channels where niche_id = '${NICHE}' and source = 'featured'`)})`);
  // 1.29.0: once its uploads are read, the cooking channel is judged on them: off topic, not counted.
  for (let i = 0; i < 3 && one(`select scanned_at is not null from yt_channels where id = '${COOK.id}'`) !== "t"; i++) await runOutliersJob({ team: TEAM });
  const cook2 = one(`select coalesce(verdict, 'not checked') || ' ' || coalesce(relevance::text, '') from outlier_niche_channels where niche_id = '${NICHE}' and channel_id = '${COOK.id}'`);
  ok(one(`select scanned_at is not null from yt_channels where id = '${COOK.id}'`) === "t" && cook2.startsWith("topic"), `read, the cooking channel is off topic (${cook2})`);
  ok(Number(one(`select count(*) from outlier_niche_channels where niche_id = '${NICHE}' and verdict = 'ok' and channel_id <> '${COOK.id}'`)) >= 10, "the phone channels fit");

  console.log("\n— Explore niches");
  const ex = await runOutliersJob({ explore: true });
  console.log("   ", JSON.stringify(ex));
  ok(Number(one(`select count(*) from outlier_niches where team_id is null`)) === 24, "24 explore niches");
  ok(ex.searches <= 2, `a light touch (${ex.searches} searches)`);
  ok(one(`select count(*) from outlier_global where key = 'explore'`) === "1", "every niche's insights together");
  ok(rest("outlier_niches?select=id&team_id=is.null", E).length === 24, "everyone on a team sees them");

  console.log("\n— A tracked channel's new video takes off");
  sql(`insert into outlier_tracked (team_id, channel_id) values ('${TEAM}', '${cid(2)}') on conflict do nothing; update yt_channels set scanned_at = now() - interval '7 hours' where id = '${cid(2)}';`);
  VIDEOS.push({ id: "NEWBIGVIDEO", channel: cid(2), title: "I Tested a $200 Fake Galaxy S26", publishedAt: new Date(Date.now() - 20 * 3600e3).toISOString(), secs: 720, views: 9_000_000, likes: 1, comments: 1, short: false, tags: [] });
  const r3 = await runOutliersJob({ team: TEAM });
  console.log("   ", JSON.stringify(r3));
  ok(one(`select (projected >= 5)::text from yt_videos where id = 'NEWBIGVIDEO'`) === "true", `heading far past its usual (${one(`select projected from yt_videos where id = 'NEWBIGVIDEO'`)})`);
  ok(Number(one(`select count(*) from notifications where kind = 'outlier_alert' and recipient_id = '${M}'`)) >= 1, "the master heard");
  ok(Number(one(`select count(*) from notifications where kind = 'outlier_alert' and recipient_id = '${R}'`)) >= 1, "the researcher heard");
  ok(Number(one(`select count(*) from notifications where kind = 'outlier_alert' and recipient_id = '${E}'`)) === 0, "the editor didn't (masters and researchers by default)");
  ok(one(`select metadata->>'href' from notifications where kind = 'outlier_alert' and recipient_id = '${M}' order by created_at desc limit 1`).includes("NEWBIGVIDEO"), "tapping it opens the video");
  await runOutliersJob({ team: TEAM });
  ok(Number(one(`select count(*) from notifications where kind = 'outlier_alert' and recipient_id = '${M}' and metadata->>'videoId' = 'NEWBIGVIDEO'`)) === 1, "only once");

  console.log("\n— Live searches");
  process.env.OUTLIERS_PERSON_SEARCHES = "2";
  const s1 = await liveSearch(TEAM, E, "galaxy s26", { days: 365 });
  ok("ids" in s1 && s1.ids.length > 0 && s1.fresh, `found (${"ids" in s1 ? s1.ids.length : s1.error})`);
  const s2 = await liveSearch(TEAM, E, "Galaxy  S26", { days: 365 });
  ok("ids" in s2 && !s2.fresh && s2.ids.length === ("ids" in s1 ? s1.ids.length : -1), "the same search again: the saved answer, no quota");
  await liveSearch(TEAM, E, "pixel 10", {});
  const s4 = await liveSearch(TEAM, E, "airpods", {});
  ok("error" in s4 && /today/.test(s4.error), `one person's limit (${"error" in s4 ? s4.error : "no error"})`);
  ok("ids" in (await liveSearch(TEAM, M, "airpods", {})), "someone else can still search");

  console.log("\n— Adding a channel by its link, and a video's fresh numbers");
  const added = await addChannelByRef(TEAM, "https://www.youtube.com/@phonelab15", { nicheId: NICHE, track: true, userId: M });
  ok("id" in added && added.id === cid(15), `added (${JSON.stringify(added)})`);
  ok(one(`select source from outlier_niche_channels where niche_id = '${NICHE}' and channel_id = '${cid(15)}'`) === "manual" && one(`select count(*) from outlier_tracked where channel_id = '${cid(15)}'`) === "1", "in the niche and tracked");
  ok(Number(one(`select count(*) from yt_videos where channel_id = '${cid(15)}' and score is not null`)) > 10, "its videos read and scored");
  ok("error" in (await addChannelByRef(TEAM, "https://example.com/x", { userId: M })), "a link that isn't YouTube");
  sql(`update yt_videos set stats_at = now() - interval '7 hours' where id = '${vid(1, 0, "L")}'`);
  VIDEOS.find((v) => v.id === vid(1, 0, "L"))!.views += 50_000;
  ok(await refreshVideo(TEAM, vid(1, 0, "L")), "a video's numbers refreshed");
  ok(Number(one(`select views from yt_videos where id = '${vid(1, 0, "L")}'`)) === VIDEOS.find((v) => v.id === vid(1, 0, "L"))!.views, "to YouTube's count");
  ok(!(await refreshVideo(TEAM, vid(1, 0, "L"))), "not again within 6 hours");

  console.log("\n— Finding channels, a niche's own channels, hiding one (1.29.0)");
  const byName = await findChannels(TEAM, M, "Phone Lab 7");
  ok(!("error" in byName) && byName.rows.some((c) => c.id === cid(7)), "found by its name among the collected");
  const byHandle = await findChannels(TEAM, M, "phonelab9");
  ok(!("error" in byHandle) && byHandle.rows[0]?.id === cid(9), "a name tried as its @handle comes first");
  const picked = await addToNiche(TEAM, NICHE, [cid(14)], { userId: M });
  ok(!("error" in picked) && one(`select source from outlier_niche_channels where niche_id = '${NICHE}' and channel_id = '${cid(14)}'`) === "manual", "picked: one of the niche's own");
  const own = rpc("outliers_channels", { p_team: TEAM, p_niche: NICHE, p_f: { only: "group" }, p_sort: "rate", p_limit: 50, p_offset: 0 }, E) as { id: string; grp: boolean; counted: boolean }[];
  ok(own.some((c) => c.id === cid(14) && c.grp && c.counted), "listed as the niche's own, and it counts");
  sql(`update outlier_niches set only_group = true where id = '${NICHE}'`);
  const onlyOwn = rpc("outliers_videos", { p_team: TEAM, p_niche: NICHE, p_f: {}, p_sort: "score", p_limit: 200, p_offset: 0 }, E) as { channel_id: string }[];
  ok(onlyOwn.length > 0 && onlyOwn.every((v) => v.channel_id === cid(14) || v.channel_id === cid(15)), `only its own channels' videos (${onlyOwn.length})`);
  sql(`update outlier_niches set only_group = false where id = '${NICHE}'`);
  execSync(`curl -s -X POST "http://127.0.0.1:54399/rest/v1/outlier_blocked" -H "Content-Type: application/json" -H "${as(E)}" -d '{"team_id":"${TEAM}","channel_id":"${cid(1)}","title":"Phone Lab 1"}'`);
  ok(one(`select added_by from outlier_blocked where team_id = '${TEAM}' and channel_id = '${cid(1)}'`) === E, "an editor hid a channel");
  const shown = rpc("outliers_videos", { p_team: TEAM, p_niche: NICHE, p_f: {}, p_sort: "score", p_limit: 200, p_offset: 0 }, M) as { channel_id: string }[];
  ok(shown.length > 0 && !shown.some((v) => v.channel_id === cid(1)), "its videos are gone for the whole team");
  sql(`delete from outlier_blocked where team_id = '${TEAM}'`);

  console.log("\n— YouTube's 30 days, and the budget");
  sql(`update yt_videos set fetched_at = now() - interval '31 days' where id = '${vid(90, 5, "L")}'`);
  sql(`insert into outlier_saves (team_id, kind, video_id) values ('${TEAM}', 'video', '${vid(90, 6, "L")}'); update yt_videos set fetched_at = now() - interval '31 days' where id = '${vid(90, 6, "L")}';`);
  await runOutliersJob({ explore: true });
  ok(one(`select count(*) from yt_videos where id = '${vid(90, 5, "L")}'`) === "0", "not refreshed in 30 days: deleted");
  ok(one(`select count(*) from outlier_saves where video_id = '${vid(90, 6, "L")}'`) === "1", "a saved video stays saved");
  await runOutliersJob({ team: TEAM });
  ok(one(`select count(*) from yt_videos where id = '${vid(90, 6, "L")}'`) === "1", "and its data is read again");
  sql(`update outlier_quota set used = 3990 where bucket = 'units'`);
  process.env.OUTLIERS_DAILY_UNITS = "4000";
  const tight = await runOutliersJob({ team: TEAM });
  ok(tight.units === 0, `no budget left: no calls (${tight.units})`);
  ok(Number(one(`select used from outlier_quota where bucket = 'units'`)) <= 4000, "never past the day's share");

  if (fails) {
    console.log(`\n${fails} check(s) failed`);
    process.exit(1);
  }
  console.log("\noutliers e2e: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
