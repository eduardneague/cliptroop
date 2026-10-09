// Facebook Reels posting (1.12.0): the publisher's steps against a fake
// Facebook (graph + rupload) and a fake Supabase (the version row and the
// file), the way the worker runs them: one step at a time, saving state.
//
// The publisher is server-only, so this file runs itself again with the
// react-server condition (that's where "server-only" is allowed).
import { spawnSync } from "node:child_process";

if (!process.env.FB_TEST_CHILD) {
  const r = spawnSync("npx", ["--yes", "tsx", "--conditions=react-server", __filename], {
    stdio: "inherit",
    env: { ...process.env, FB_TEST_CHILD: "1" },
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}

const SUPA = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
delete process.env.FACEBOOK_GRAPH_VERSION;

type Sc = {
  refuseUrl?: boolean;
  urlTimeout?: boolean;
  cutAfter?: number;
  processingError?: string;
  startError?: { status: number; message: string };
  permalinkError?: boolean;
  duration?: number | null;
};
type V = { got: number; complete: boolean; published: boolean; checks: number; cuts: number; description?: string; mode?: string };

const FILE = new Uint8Array(300_000).map((_, i) => (i * 31) % 251);
let sc: Sc = {};
const videos = new Map<string, V>();
const calls: string[] = [];
let nextId = 5000;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function readAll(body: ReadableStream<Uint8Array>, limit?: number) {
  const reader = body.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { n, cut: false };
    n += value.byteLength;
    if (limit !== undefined && n >= limit) {
      await reader.cancel();
      return { n: limit, cut: true };
    }
  }
}

function fileResponse(range: string | null) {
  const m = /bytes=(\d+)-(\d*)/.exec(range ?? "");
  if (!m) return new Response(FILE, { status: 200, headers: { "Content-Type": "video/mp4" } });
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : FILE.length - 1;
  return new Response(FILE.slice(start, end + 1), { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${FILE.length}` } });
}

globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = String(init.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));

  // --- fake Supabase -------------------------------------------------------
  if (url.startsWith(`${SUPA}/rest/v1/short_video_versions`)) {
    const row = { storage_path: "team/short/v1.mp4", size_bytes: FILE.length, mime_type: "video/mp4", duration_sec: sc.duration === undefined ? 42 : sc.duration, deleted_at: null };
    return json(200, /vnd\.pgrst\.object/.test(headers.get("accept") ?? "") ? row : [row]);
  }
  if (url.startsWith(`${SUPA}/storage/v1/object/sign/review-videos/`)) {
    // POST = make a signed link; GET = read the file through it.
    return method === "POST" ? json(200, { signedURL: "/object/sign/review-videos/team/short/v1.mp4?token=t" }) : fileResponse(headers.get("range"));
  }

  // --- fake Facebook -------------------------------------------------------
  if (url.startsWith("https://graph.facebook.com/v23.0/")) {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (method === "POST" && parts[2] === "video_reels" && parts[1] === "PAGE") {
      const p = new URLSearchParams(String(init.body));
      if (p.get("access_token") !== "PAGE_TOKEN") return json(400, { error: { message: "(#190) Invalid OAuth access token" } });
      if (p.get("upload_phase") === "start") {
        calls.push("start");
        if (sc.startError) return json(sc.startError.status, { error: { message: sc.startError.message } });
        const id = String(nextId++);
        videos.set(id, { got: 0, complete: false, published: false, checks: 0, cuts: 0 });
        return json(200, { video_id: id, upload_url: `https://rupload.facebook.com/video-upload/v23.0/${id}` });
      }
      if (p.get("upload_phase") === "finish") {
        calls.push("finish");
        const v = videos.get(p.get("video_id")!);
        if (!v?.complete) return json(400, { error: { message: "(#100) The video hasn't been uploaded" } });
        if (p.get("video_state") !== "PUBLISHED") return json(400, { error: { message: "(#100) video_state" } });
        v.published = true;
        v.description = p.get("description") ?? "";
        return json(200, { success: true });
      }
    }
    if (method === "GET" && parts.length === 2) {
      const v = videos.get(parts[1]);
      if (!v) return json(404, { error: { message: "Unknown video" } });
      if (u.searchParams.get("fields") === "status") {
        calls.push("status");
        const status: any = {
          video_status: "processing",
          uploading_phase: v.complete ? { status: "complete" } : { status: v.got ? "in_progress" : "not_started", bytes_transfered: v.got },
          processing_phase: { status: v.complete ? "in_progress" : "not_started" },
          publishing_phase: { status: "not_started" },
        };
        if (sc.processingError && v.complete) status.processing_phase = { status: "not_started", error: { message: sc.processingError } };
        if (v.published && ++v.checks > 2) status.publishing_phase = { status: "complete", publish_status: "published" };
        return json(200, { status, id: parts[1] });
      }
      if (u.searchParams.get("fields") === "permalink_url") {
        if (sc.permalinkError) return json(400, { error: { message: "(#100) Tried accessing nonexisting field" } });
        return json(200, { permalink_url: `/reel/${parts[1]}`, id: parts[1] });
      }
    }
    return json(400, { error: { message: `fake graph: ${method} ${u.pathname}` } });
  }
  if (url.startsWith("https://rupload.facebook.com/video-upload/v23.0/")) {
    const v = videos.get(url.split("/").pop()!);
    if (headers.get("authorization") !== "OAuth PAGE_TOKEN") return json(401, { debug_info: { retriable: false, message: "bad token" } });
    if (!v) return json(404, { debug_info: { retriable: false, message: "no session" } });
    const fileUrl = headers.get("file_url");
    if (fileUrl) {
      calls.push("url");
      if (sc.urlTimeout) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      if (sc.refuseUrl) return json(400, { debug_info: { retriable: false, type: "ProcessingFailedError", message: "Failed to fetch the video" } });
      const r = await fetch(fileUrl);
      v.got = (await readAll(r.body!)).n;
      v.complete = v.got === FILE.length;
      v.mode = "url";
      return json(200, { success: true });
    }
    calls.push(`bin@${headers.get("offset")}`);
    if (Number(headers.get("offset")) !== v.got) return json(400, { debug_info: { retriable: false, type: "OffsetInvalidError", message: `offset should be ${v.got}` } });
    if (headers.get("content-type") !== "application/octet-stream" || init.duplex !== "half") return json(400, { debug_info: { retriable: false, message: "not a stream" } });
    const cut = sc.cutAfter !== undefined && v.cuts === 0;
    v.got += (await readAll(init.body, cut ? sc.cutAfter : undefined)).n;
    v.mode = "binary";
    if (cut) {
      v.cuts++;
      throw new TypeError("fetch failed");
    }
    if (v.got !== Number(headers.get("file_size"))) return json(400, { debug_info: { retriable: false, type: "PartialRequestError", message: "size" } });
    v.complete = true;
    return json(200, { success: true });
  }
  throw new Error(`unexpected request: ${method} ${url}`);
}) as typeof fetch;

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

(async () => {
  const { facebookStep } = await import("../lib/social/publishers/facebook");
  const { PublishError } = await import("../lib/social/publishers/common");

  async function run(s: Sc, deadlineMs = 45_000) {
    sc = s;
    calls.length = 0;
    let post: any = {
      id: "p", team_id: "t", short_id: "s", platform: "facebook", account_id: "a", version_id: "00000000-0000-4000-8000-000000000001",
      scheduled_at: new Date().toISOString(), step: "start", state: {}, options: { caption: "Morning routine #shorts" }, attempts: 0, external_id: null,
    };
    const events: string[] = [];
    let retries = 0;
    for (let i = 0; i < 80; i++) {
      try {
        const r = await facebookStep(post, "PAGE_TOKEN", "PAGE", Date.now() + deadlineMs);
        if (r.event) events.push(r.event.kind);
        if (r.status === "published") return { r, events, error: null as any };
        post = { ...post, step: r.step, state: r.state ?? post.state };
      } catch (e) {
        if (!(e instanceof PublishError) || !e.retry || ++retries > 3) return { r: null, events, error: e as any };
      }
    }
    return { r: null, events, error: new Error("never finished") as any };
  }

  // Facebook fetches the file from the private link.
  let x = await run({});
  ok(x.r?.status === "published", `published (${x.error?.message ?? ""})`);
  ok(x.r?.permalink === `https://www.facebook.com/reel/${x.r?.externalId}`, "permalink made absolute");
  ok(videos.get(x.r?.externalId ?? "")?.description === "Morning routine #shorts", "the caption is the Reel's description");
  ok(videos.get(x.r?.externalId ?? "")?.mode === "url", "uploaded by link");
  ok(calls.indexOf("finish") > calls.indexOf("url"), "published only after the upload");
  ok(x.events.join() === "started,uploaded,published", `events: ${x.events.join()}`);

  // The link is refused: the file is streamed, cut off, and resumed where Facebook got to.
  x = await run({ refuseUrl: true, cutAfter: 100_000, permalinkError: true });
  ok(x.r?.status === "published", `streamed and published (${x.error?.message ?? ""})`);
  ok(calls.includes("bin@0") && calls.includes("bin@100000"), `resumed from Facebook's offset (${calls.filter((c) => c.startsWith("bin")).join(", ")})`);
  ok(videos.get(x.r?.externalId ?? "")?.got === FILE.length, "every byte arrived once");
  ok(x.r?.permalink === `https://www.facebook.com/reel/${x.r?.externalId}`, "the /reel/ link when Facebook gives none");

  // Our request times out while Facebook fetches: it waits, then streams it.
  x = await run({ urlTimeout: true });
  ok(x.r?.status === "published" && calls.some((c) => c.startsWith("bin")), "a timed-out link upload falls back to streaming");

  // Facebook can't use the file: a clear, final error.
  x = await run({ processingError: "Resolution too low. Video must have a minimum resolution of 540p." });
  ok(/^Facebook couldn't use the video: Resolution too low/.test(x.error?.message ?? "") && x.error?.retry === false, `processing error: ${x.error?.message}`);

  // A Page connected without pages_manage_posts.
  x = await run({ startError: { status: 403, message: "(#200) Requires pages_manage_posts permission to manage the object" } });
  ok(/isn't allowed to post on this Page/.test(x.error?.message ?? "") && x.error?.retry === false, `permission: ${x.error?.message}`);

  // Facebook's daily limit: retried later.
  x = await run({ startError: { status: 400, message: "(#4) Application request limit reached" } });
  ok(/30 Reels a day/.test(x.error?.message ?? "") && x.error?.retry === true, `limit: ${x.error?.message}`);

  // Too long (or too short) for a Reel: refused before Facebook is called.
  x = await run({ duration: 120 });
  ok(/3 to 90 seconds/.test(x.error?.message ?? "") && !calls.includes("start"), `120 s: ${x.error?.message}`);
  x = await run({ duration: 2 });
  ok(/3 to 90 seconds/.test(x.error?.message ?? "") && !calls.includes("start"), "2 s refused");
  x = await run({ duration: null });
  ok(x.r?.status === "published", "unknown length: Facebook decides");

  // No time left in this run: hands over without starting a stream.
  x = await run({ refuseUrl: true }, 14_000);
  ok(!calls.some((c) => c.startsWith("bin")), "no stream started without time for it");

  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
