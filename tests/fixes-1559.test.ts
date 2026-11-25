// 1.55.9: Outliers → Saved → Add a video (a link to one found on YouTube itself).
// The reading runs for real here (the link, requests.ts, the collector, the scores)
// against a small stand-in database and a stand-in YouTube. It's server-only, so
// this file runs itself again with the react-server condition.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

if (!process.env.LINK_TEST_CHILD) {
  const r = spawnSync("npx", ["--yes", "tsx", "--conditions=react-server", __filename], {
    stdio: "inherit",
    env: { ...process.env, LINK_TEST_CHILD: "1" },
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.YOUTUBE_API_KEY = "key";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// ---------------------------------------------------------------------------
// The stand-in world
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const CH = `UC${"a".repeat(22)}`;
const CH2 = `UC${"b".repeat(22)}`;
const TEAM = "11111111-1111-4111-8111-111111111111";

// YouTube: two channels. Their latest lists hold what's under 200 days old.
type V = { id: string; kind: "long" | "short" | "live"; views: number; days: number; ch: string };
const tube = new Map<string, V>();
const put = (v: V) => tube.set(v.id, v);
for (let i = 1; i <= 12; i++) put({ id: `longVideo${String(i).padStart(2, "0")}`, kind: "long", views: 900 + i * 20, days: i * 7, ch: CH });
for (let i = 1; i <= 6; i++) put({ id: `shortVid_${String(i).padStart(2, "0")}`, kind: "short", views: 5000, days: i * 3, ch: CH });
put({ id: "pastedVid01", kind: "long", views: 50_000, days: 400, ch: CH });
put({ id: "oldVideo002", kind: "long", views: 3000, days: 500, ch: CH });
put({ id: "liveStream1", kind: "live", views: 100, days: 0, ch: CH });
for (let i = 1; i <= 5; i++) put({ id: `ch2Long_00${i}`, kind: "long", views: 2000, days: i * 5, ch: CH2 });
for (let i = 1; i <= 5; i++) put({ id: `ch2Short_0${i}`, kind: "short", views: i === 3 ? 90_000 : 8000, days: i * 4, ch: CH2 });

let calls: string[] = [];
let units = Infinity;
const db: Record<string, Row[]> = {};
const table = (t: string) => (db[t] ??= []);

function youtube(u: URL): unknown {
  const path = u.pathname.split("/").pop()!;
  calls.push(path === "videos" && u.searchParams.get("part")!.includes("player") ? "videos+player" : path);
  if (path === "videos") {
    const player = u.searchParams.get("part")!.includes("player");
    return {
      items: u.searchParams
        .get("id")!
        .split(",")
        .filter((id) => tube.has(id))
        .map((id) => {
          const v = tube.get(id)!;
          return {
            id,
            snippet: { channelId: v.ch, title: `Video ${id}`, description: "", publishedAt: iso(v.days), liveBroadcastContent: v.kind === "live" ? "live" : "none" },
            contentDetails: { duration: v.kind === "short" ? "PT40S" : "PT12M" },
            statistics: { viewCount: String(v.views), likeCount: "10", commentCount: "2" },
            status: { madeForKids: false },
            ...(player ? { player: { embedWidth: "360", embedHeight: v.kind === "short" ? "640" : "203" } } : {}),
          };
        }),
    };
  }
  if (path === "channels") return { items: u.searchParams.get("id")!.split(",").map((id) => ({ id, snippet: { title: `Channel ${id.slice(2, 4)}`, customUrl: "@achannel", publishedAt: iso(2000) }, statistics: { subscriberCount: "12000", viewCount: "900000", videoCount: "40" } })) };
  if (path === "playlistItems") {
    const pl = u.searchParams.get("playlistId")!;
    const kind = pl.startsWith("UULF") ? "long" : pl.startsWith("UUSH") ? "short" : null;
    const ch = `UC${pl.slice(kind ? 4 : 2)}`;
    const ids = [...tube.values()].filter((v) => v.ch === ch && v.days < 200 && (!kind || v.kind === kind)).sort((a, b) => a.days - b.days);
    return { items: ids.map((v) => ({ contentDetails: { videoId: v.id } })) };
  }
  throw new Error(`YouTube ${path}?`);
}

// The database: just what these requests ask of PostgREST.
const filters = (u: URL) => {
  const fs: ((r: Row) => boolean)[] = [];
  for (const [k, v] of u.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) fs.push((r) => String(r[k]) === v.slice(3));
    else if (v.startsWith("in.(")) {
      const s = new Set(v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")));
      fs.push((r) => s.has(String(r[k])));
    } else throw new Error(`filter ${k}=${v}`);
  }
  return (r: Row) => fs.every((f) => f(r));
};
function pick(rows: Row[], u: URL) {
  let out = rows;
  const order = u.searchParams.get("order");
  if (order) {
    const [c, dir] = order.split(".");
    out = [...out].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (dir === "desc" ? -1 : 1));
  }
  const limit = Number(u.searchParams.get("limit") ?? 0);
  if (limit) out = out.slice(0, limit);
  const sel = u.searchParams.get("select") ?? "*";
  const embed = /yt_channels\(([^)]*)\)/.exec(sel);
  const cols = sel.replace(/,?yt_channels\([^)]*\)/, "").split(",").map((c) => c.trim()).filter(Boolean);
  return out.map((r) => {
    const o: Row = cols.includes("*") ? { ...r } : Object.fromEntries(cols.map((c) => [c, r[c] ?? null]));
    if (embed) {
      const ch = table("yt_channels").find((c) => c.id === r.channel_id);
      o.yt_channels = ch ? Object.fromEntries(embed[1].split(",").map((c) => [c.trim(), ch[c.trim()] ?? null])) : null;
    }
    return o;
  });
}
function rest(method: string, u: URL, body: unknown, prefer: string): { status: number; json?: unknown } {
  const [first, fn] = u.pathname.replace("/rest/v1/", "").split("/");
  if (first === "rpc") {
    if (fn === "outlier_take") return { status: 200, json: units-- > 0 ? 1 : -1 };
    if (fn === "outliers_set_scores") {
      for (const p of (body as { p: Row[] }).p) Object.assign(table("yt_videos").find((r) => r.id === p.id) ?? {}, p);
      return { status: 200, json: null };
    }
    throw new Error(`rpc ${fn}?`);
  }
  const t = first;
  if (method === "GET") return { status: 200, json: pick(table(t).filter(filters(u)), u) };
  if (method === "POST") {
    const key = u.searchParams.get("on_conflict")?.split(",");
    for (const r of (Array.isArray(body) ? body : [body]) as Row[]) {
      const there = key ? table(t).find((x) => key.every((k) => x[k] === r[k])) : undefined;
      if (!there) table(t).push({ ...r });
      else if (!prefer.includes("ignore-duplicates")) Object.assign(there, r);
    }
    return { status: 201 };
  }
  if (method === "PATCH") {
    for (const r of table(t).filter(filters(u))) Object.assign(r, body);
    return { status: 204 };
  }
  throw new Error(`${method} ${t}?`);
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (u.hostname === "www.googleapis.com") return new Response(JSON.stringify(youtube(u)), { status: 200, headers: { "content-type": "application/json" } });
  if (u.hostname === "db.test") {
    const h = new Headers(init?.headers);
    const r = rest(init?.method ?? "GET", u, init?.body ? JSON.parse(String(init.body)) : undefined, h.get("prefer") ?? "");
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  }
  throw new Error(`no network here: ${u.href}`);
}) as typeof fetch;

const video = (id: string) => table("yt_videos").find((r) => r.id === id) as (Row & { score: number | null; kind: string }) | undefined;
const channel = (id: string) => table("yt_channels").find((r) => r.id === id) as (Row & { scanned_at: string | null }) | undefined;

(async () => {
  const { addVideoById } = await import("../modules/outliers/lib/requests");
  const { parseVideoRef } = await import("../modules/outliers/lib/ingest");

  // ---- The link: every way YouTube shares one, and what isn't one.
  const id = "dQw4w9WgXcQ";
  for (const l of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}&si=x`,
    `https://youtu.be/${id}?si=Abc_123`,
    `youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}?feature=share`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `  ${id}  `,
  ])
    ok(parseVideoRef(l) === id, `a video link: ${l}`);
  for (const l of ["", "hello", "https://vimeo.com/123456789", "https://www.youtube.com/@somechannel", `https://www.youtube.com/channel/${CH}`, "https://www.youtube.com/playlist?list=PL123", "https://youtu.be/short", "https://evil.example/watch?v=dQw4w9WgXcQ"])
    ok(parseVideoRef(l) === null, `not a video link: ${JSON.stringify(l)}`);

  // ---- New to Outliers, its channel too: the video (with its player's shape), the channel, the channel's lists, its score.
  calls = [];
  let r = await addVideoById(TEAM, "pastedVid01");
  ok("id" in r && r.id === "pastedVid01", `a new video is kept (${JSON.stringify(r)})`);
  ok(calls[0] === "videos+player", `it's read with its player's shape (a Short or not): ${calls.join(", ")}`);
  ok(calls.includes("channels") && calls.filter((c) => c === "playlistItems").length === 2, `its channel and both of its lists are read: ${calls.join(", ")}`);
  ok(video("pastedVid01")?.kind === "long" && (video("pastedVid01")?.score ?? 0) > 10, `it has its score against the channel's videos (${video("pastedVid01")?.score})`);
  ok((video("longVideo05")?.score ?? null) !== null && table("yt_videos").length >= 19, "the channel's latest videos came with it, scored");
  const readAt = channel(CH)?.scanned_at;
  ok(!!readAt && Date.now() - Date.parse(readAt) < 60_000, "its channel is marked as read now");

  // ---- Already scored: nothing is asked of YouTube.
  calls = [];
  r = await addVideoById(TEAM, "pastedVid01");
  ok("id" in r && calls.length === 0, `one Outliers has scored asks YouTube nothing (${calls.join(", ")})`);

  // ---- Its channel was read lately: the video alone, scored again from what's stored, the channel not marked as read again.
  calls = [];
  await new Promise((res) => setTimeout(res, 15));
  r = await addVideoById(TEAM, "oldVideo002");
  ok("id" in r && calls.join(",") === "videos+player", `a channel read lately isn't read again (${calls.join(", ")})`);
  ok((video("oldVideo002")?.score ?? null) !== null, `the video is scored from what's stored (${video("oldVideo002")?.score})`);
  ok(channel(CH)?.scanned_at === readAt, "scoring it again doesn't count as reading the channel");

  // ---- Read lately, but only its long videos (a niche of long videos): a Short of it has nothing to compare with, so the channel is read.
  table("yt_channels").push({ id: CH2, title: "Channel bb", fetched_at: iso(0), scanned_at: iso(1 / 24), scan_depth: 1 });
  for (const v of [...tube.values()].filter((x) => x.ch === CH2 && x.kind === "long")) table("yt_videos").push({ id: v.id, channel_id: CH2, kind: "long", title: `Video ${v.id}`, published_at: iso(v.days), views: v.views, score: 1 });
  calls = [];
  r = await addVideoById(TEAM, "ch2Short_03");
  ok("id" in r && video("ch2Short_03")?.kind === "short", `a Short is kept as a Short (${video("ch2Short_03")?.kind})`);
  ok(calls.filter((c) => c === "playlistItems").length === 2, `with nothing like it to compare with, its channel is read (${calls.join(", ")})`);
  ok((video("ch2Short_03")?.score ?? 0) > 5, `then it's scored against its channel's Shorts (${video("ch2Short_03")?.score})`);

  // ---- A live stream: kept, never scored, its channel not read for it.
  calls = [];
  r = await addVideoById(TEAM, "liveStream1");
  ok("id" in r && video("liveStream1")?.kind === "live" && !calls.includes("playlistItems"), `a live stream is kept without reading its channel (${calls.join(", ")})`);

  // ---- YouTube doesn't have it.
  r = await addVideoById(TEAM, "missingVid1");
  ok("error" in r && /couldn't find that video/.test(r.error) && !video("missingVid1"), `a video YouTube doesn't have: ${JSON.stringify(r)}`);
  r = await addVideoById(TEAM, "not-an-id");
  ok("error" in r, "not a video id: no");

  // ---- No YouTube budget left: a new one can't be read (said); one Outliers has is still saved, as it is.
  units = 0;
  put({ id: "budgetVid01", kind: "long", views: 1000, days: 30, ch: CH });
  r = await addVideoById(TEAM, "budgetVid01");
  ok("error" in r && /used up/.test(r.error), `no budget: a new video says so (${JSON.stringify(r)})`);
  Object.assign(video("longVideo03")!, { score: null });
  Object.assign(channel(CH)!, { scanned_at: iso(2) });
  r = await addVideoById(TEAM, "longVideo03");
  ok("id" in r && r.id === "longVideo03", `no budget: a stored one is saved as it is (${JSON.stringify(r)})`);
  units = Infinity;

  // ---- No way to read YouTube at all.
  delete process.env.YOUTUBE_API_KEY;
  r = await addVideoById(TEAM, "budgetVid01");
  ok("error" in r && /Connect the team's YouTube channel/.test(r.error), `no YouTube access: says how to connect (${JSON.stringify(r)})`);
  process.env.YOUTUBE_API_KEY = "key";

  // ---------------------------------------------------------------------------
  // The pieces around it
  // ---------------------------------------------------------------------------
  const collector = read("modules/outliers/lib/collector.ts");
  ok(/export async function rescoreChannel\(ctx: Ctx, cid: string\) \{\s*await recomputeChannel\(ctx, cid, 0, false\);/.test(collector), "the collector scores a channel again without reading it");
  ok(/\.\.\.\(read \? \{ scanned_at: new Date\(\)\.toISOString\(\) \} : \{\}\)/.test(collector), "only a real read marks a channel as read");

  const actions = read("app/(dashboard)/outliers/actions.ts");
  const fn = actions.slice(actions.indexOf("export async function saveVideoLink"), actions.indexOf("export async function saveChannel"));
  ok(fn.length > 0 && /if \(!user \|\| !member\) return \{ error: "Your session expired\. Sign in again\." \}/.test(fn), "only people on the team add videos");
  ok(/folderId && !UUID\.test\(folderId\)/.test(fn) && /link\.length <= 500 \? parseVideoRef\(link\)/.test(fn), "the folder and the link are checked first");
  ok(fn.indexOf(`.eq("video_id", id)`) < fn.indexOf("addVideoById(teamId, id)") && /That video's already in this folder\./.test(fn) && /That video's already saved, in \$\{names\.join\(" and "\)\}\./.test(fn), "one already saved here is said before YouTube is asked");
  ok(/overLimit\("outliers-link", user\.id, 40, 60 \* 60_000\)/.test(fn), "a person adds at most 40 an hour");
  ok(/error\?\.code === "23505"/.test(fn), "two adds at once: the second is already saved");
  ok(/getSaved\(teamId, null, \{ id: data\.id as string \}\)/.test(fn) && /return \{ item: item \?\? null \}/.test(fn), "it answers with the card, read like the rest of Saved");
  ok(/if \(o\.id\) q = q\.eq\("id", o\.id\);/.test(read("modules/outliers/lib/queries.ts")), "Saved can read one save");

  const tab = read("modules/outliers/components/tabs/saved-tab.tsx");
  ok(/onClick=\{\(\) => setAdding\(true\)\}[^>]*>\s*<PlusIcon[^>]*\/>\s*Add a video/.test(tab), "Saved has Add a video");
  ok(/saveVideoLink\(ctx\.teamId, l, folder\?\.id \?\? null\)/.test(tab), "it goes in the folder that's open (or none)");
  ok(/readOnly=\{busy\}/.test(tab) && /input\.current\?\.select\(\)/.test(tab) && /aria-live="polite"/.test(tab), "the link keeps focus, a wrong one is selected, what happened is read out");
  ok(/saves\.addSave\(\{ ref: item\.video\.id, folderId: item\.folderId, id: item\.id \}\)/.test(tab) && /count: f\.count \+ 1/.test(tab), "the bookmark fills and the folder counts it");
  ok(/view === "unsorted" \? !item\.folderId : view === item\.folderId/.test(tab), "a card lands only in the folder it went in");
  ok(/onClose=\{closeAdd\}/.test(tab) && /addBtn\.current\?\.focus\(\)/.test(tab), "closing the form gives the keyboard back to Add a video");
  ok(/Found a video on YouTube yourself\? Add a video, and paste its link\./.test(tab), "an empty Saved says it can be done");

  console.log(fails ? `${fails} failed` : "fixes-1559: all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
