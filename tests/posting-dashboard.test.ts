// The Posting dashboard (1.24.0, modules/posting/lib/dashboard.ts): what's
// not out yet, everything posted (ClipTroop's or not), the numbers on top,
// the filters, and a frame of the video as its thumbnail.
import {
  busySoon,
  cellsOf,
  groupByDay,
  matchesSearch,
  mergePosted,
  nextUp,
  onDay,
  platformSummary,
  postingStats,
  queueItem,
  stripCells,
  stripWindow,
  type ContentRow,
  type QueueItem,
  type QueueRow,
} from "../modules/posting/lib/dashboard";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const NOW = Date.parse("2026-10-15T12:00:00Z");
const MIN = 60_000;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const short = (n: number) => ({ id: `s${n}`, number: n, title: `Short ${n}` });
const row = (o: Partial<QueueRow> & { id: string }): QueueRow => ({
  platform: "youtube",
  status: "scheduled",
  progress: 0,
  scheduled_at: iso(NOW + 60 * MIN),
  next_attempt_at: iso(NOW + 60 * MIN),
  last_error: null,
  attempts: 0,
  permalink: null,
  external_id: null,
  short: short(1),
  ...o,
});
const q = (o: Partial<QueueRow> & { id: string }) => queueItem(row(o), NOW)!;

// ---- Not out yet ---------------------------------------------------------
{
  ok(q({ id: "a" }).section === "upcoming", "scheduled later: upcoming");
  const late = q({ id: "b", scheduled_at: iso(NOW - 10 * MIN), next_attempt_at: iso(NOW - 10 * MIN) });
  ok(late.late && late.section === "attention", "still not started 10 minutes after its time: late, needs attention");
  ok(!q({ id: "c", scheduled_at: iso(NOW - 2 * MIN), next_attempt_at: iso(NOW - 2 * MIN) }).late, "2 minutes after its time: not late yet");
  ok(q({ id: "d", status: "failed" }).section === "attention", "failed: needs attention");
  ok(q({ id: "e", status: "uploading", attempts: 1 }).section === "attention", "retrying: needs attention");
  ok(q({ id: "f", status: "uploading", progress: 45.6 }).section === "moving" && q({ id: "f", status: "uploading", progress: 45.6 }).progress === 46, "uploading: in progress, rounded");
  ok(q({ id: "g", status: "waiting" }).section === "moving", "YouTube holding it: in progress");
  ok(queueItem(row({ id: "h", platform: "myspace" }), NOW) === null, "an unknown platform is left out");
  ok(q({ id: "i", external_id: "dQw4w9WgXcQ" }).link === "https://studio.youtube.com/video/dQw4w9WgXcQ/edit", "YouTube: a link to Studio once it has an id");
  ok(q({ id: "j", permalink: "javascript:alert(1)" }).link === null, "never a link that runs");
  ok(q({ id: "k", platform: "youtube", status: "waiting", scheduled_at: iso(NOW + 10 * MIN) }).canPostNow, "YouTube waiting with a later time: can post now");
  ok(!q({ id: "l", platform: "instagram", status: "processing" }).canPostNow, "processing elsewhere: can't");
  const withPoster = queueItem(row({ id: "m" }), NOW, (id) => ({ src: `https://i.ytimg.com/${id}.jpg`, strip: null }));
  ok(withPoster?.poster.src === "https://i.ytimg.com/s1.jpg", "the short's picture is asked by its id");
}

// ---- Everything posted ---------------------------------------------------
const content = (o: Partial<ContentRow> & { externalId: string }): ContentRow => ({
  platform: "youtube",
  kind: "short",
  title: "On YouTube",
  url: "https://youtube.com/shorts/x",
  thumbnail: "https://i.ytimg.com/x.jpg",
  publishedAt: iso(NOW - 60 * MIN),
  views: 100,
  likes: 5,
  comments: 1,
  shortId: null,
  projectId: null,
  number: null,
  ...o,
});
{
  const items = mergePosted({
    content: [
      content({ externalId: "yt1", shortId: "s1", number: 1, publishedAt: iso(NOW - 3 * 60 * MIN) }),
      content({ externalId: "yt2", title: "Posted in Studio", publishedAt: iso(NOW - 30 * MIN) }),
      content({ platform: "instagram", externalId: "ig1", shortId: "s2", number: 2, thumbnail: "https://scontent.cdninstagram.com/a.jpg", publishedAt: iso(NOW - 2 * 60 * MIN) }),
      content({ platform: "instagram", externalId: "ig2", shortId: "s3", number: 3 }),
      content({ platform: "youtube", externalId: "lv1", kind: "long", projectId: "p9", number: 9, publishedAt: iso(NOW - 5 * DAY) }),
      content({ platform: "myspace", externalId: "zz" }),
      content({ externalId: "yt2" }),
    ],
    published: [
      // By external id (YouTube), by short (Instagram), and one the copy doesn't have yet (TikTok).
      { platform: "youtube", shortId: "s1", externalId: "yt1", permalink: null, publishedAt: iso(NOW - 3 * 60 * MIN), short: short(1) },
      { platform: "instagram", shortId: "s2", externalId: null, permalink: "https://instagram.com/reel/a", publishedAt: iso(NOW - 2 * 60 * MIN), short: short(2) },
      { platform: "tiktok", shortId: "s1", externalId: "v_pub_1", permalink: null, publishedAt: iso(NOW - 10 * MIN), short: short(1) },
    ],
    marked: [
      // ClipTroop's own (the worker marks them too): not twice.
      { platform: "instagram", shortId: "s2", url: null, postedAt: iso(NOW - 2 * 60 * MIN), short: short(2) },
      // Marked by hand, not in the copy.
      { platform: "facebook", shortId: "s4", url: "https://facebook.com/reel/1", postedAt: iso(NOW - 4 * 60 * MIN), short: short(4) },
      // Marked, in the copy (ig2 is s3's).
      { platform: "instagram", shortId: "s3", url: null, postedAt: iso(NOW - 60 * MIN), short: short(3) },
      // An older ClipTroop post (known from byApp).
      { platform: "youtube", shortId: "s7", url: null, postedAt: iso(NOW - 40 * DAY), short: short(7) },
    ],
    byApp: ["youtube:s7"],
    strip: (id) => (id === "s1" ? { url: "/api/frames/v1", cellW: 135, cellH: 240 } : null),
  });
  const by = (k: string) => items.find((i) => i.key === k);
  ok(items.length === 8, `each video once, unknown platforms left out (got ${items.length}: ${items.map((i) => i.key).join(", ")})`);
  ok(items.map((i) => i.key).join() === "tiktok:ours-s1,youtube:yt2,instagram:ig2,instagram:ig1,youtube:yt1,facebook:ours-s4,youtube:lv1,youtube:ours-s7", `newest first (got ${items.map((i) => i.key).join()})`);
  ok(by("youtube:yt1")?.byApp === true, "ClipTroop's post, found by its id");
  ok(by("instagram:ig1")?.byApp === true, "ClipTroop's post, found by its short");
  ok(by("youtube:yt2")?.byApp === false && by("youtube:yt2")?.ours === null, "posted in YouTube Studio: not ClipTroop's, not ours");
  ok(by("instagram:ig2")?.byApp === false && by("instagram:ig2")?.marked === false && by("instagram:ig2")?.ours?.number === 3, "marked by hand and in the copy: listed once, with its numbers, not ClipTroop's");
  const tt = by("tiktok:ours-s1");
  ok(!!tt && tt.byApp && tt.views === null && tt.analyticsId === null && tt.poster.strip?.url === "/api/frames/v1", "ClipTroop's post the copy doesn't have: listed, no numbers, the video's frames as its picture");
  const fb = by("facebook:ours-s4");
  ok(!!fb && fb.marked && !fb.byApp && fb.url === "https://facebook.com/reel/1", "marked by hand, not in the copy: listed as marked");
  ok(by("youtube:ours-s7")?.byApp === true && by("youtube:ours-s7")?.marked === false, "an older ClipTroop post (from byApp) isn't called marked");
  ok(by("youtube:lv1")?.ours?.kind === "long" && by("youtube:lv1")?.kind === "long", "a long video of ours");
  ok(by("youtube:yt1")?.poster.src === "https://i.ytimg.com/x.jpg" && by("youtube:yt1")?.poster.strip?.cellW === 135, "the platform's picture first, the frames as a fallback");
  ok(by("instagram:ig1")?.analyticsId === "ig1", "Instagram: its analytics page");
}

// ---- The numbers on top ----------------------------------------------------
{
  const queue: QueueItem[] = [
    q({ id: "1", platform: "youtube", scheduled_at: iso(NOW + 30 * MIN), short: short(5) }),
    q({ id: "2", platform: "instagram", scheduled_at: iso(NOW + 30 * MIN + 20_000), short: short(5) }),
    q({ id: "3", platform: "tiktok", scheduled_at: iso(NOW + 3 * 60 * MIN), short: short(6) }),
    q({ id: "4", platform: "youtube", status: "uploading", scheduled_at: iso(NOW - 5 * MIN), next_attempt_at: iso(NOW - 5 * MIN) }),
    q({ id: "5", platform: "youtube", status: "waiting", scheduled_at: iso(NOW + 20 * MIN) }),
    q({ id: "6", platform: "facebook", status: "failed", scheduled_at: iso(NOW - 60 * MIN) }),
    q({ id: "7", platform: "instagram", scheduled_at: iso(NOW + 9 * DAY) }),
  ];
  const n = nextUp(queue, NOW);
  ok(n?.at === queue[4].scheduledAt && n.items.length === 1, "next: YouTube's own hold at +20 min comes first");
  const n2 = nextUp(queue.filter((x) => x.id !== "5"), NOW);
  ok(n2?.items.map((i) => i.id).join() === "1,2", `next: one short on two platforms in the same minute is one moment (got ${n2?.items.map((i) => i.id).join()})`);
  ok(nextUp([], NOW) === null, "nothing scheduled: no next");
  const posted = mergePosted({
    content: [content({ externalId: "a", shortId: "s1", publishedAt: iso(NOW - DAY), views: 1000 }), content({ externalId: "b", publishedAt: iso(NOW - 2 * DAY), views: 500 }), content({ externalId: "c", publishedAt: iso(NOW - 9 * DAY) })],
    published: [{ platform: "youtube", shortId: "s1", externalId: "a", permalink: null, publishedAt: iso(NOW - DAY), short: short(1) }],
  });
  const s = postingStats(queue, posted, NOW);
  ok(s.scheduled === 6 && s.attention === 1, `scheduled counts what's ahead, not the failed one (got ${s.scheduled}, attention ${s.attention})`);
  ok(s.scheduledWeek === 5, `in the next 7 days (got ${s.scheduledWeek})`);
  ok(s.moving === 1, "one uploading");
  ok(s.postedWeek === 2 && s.postedWeekByApp === 1, `posted in the last 7 days, one by ClipTroop (got ${s.postedWeek}/${s.postedWeekByApp})`);
  const yt = platformSummary("youtube", queue, posted, NOW);
  ok(yt.scheduled === 3 && yt.attention === 0 && yt.next?.id === "5" && yt.postedWeek === 2 && yt.viewsWeek === 1500 && yt.latest.length === 3, `YouTube's card (got ${JSON.stringify({ ...yt, next: yt.next?.id, latest: yt.latest.length })})`);
  const fb = platformSummary("facebook", queue, posted, NOW);
  ok(fb.attention === 1 && fb.next === null && fb.viewsWeek === null && fb.latest.length === 0, "Facebook's card: a failed post, nothing else");
  ok(busySoon(queue, NOW), "uploading: refresh quickly");
  ok(!busySoon([q({ id: "x", scheduled_at: iso(NOW + 3 * 60 * MIN) })], NOW), "the next post in 3 hours: no hurry");
  ok(busySoon([q({ id: "y", scheduled_at: iso(NOW + 10 * MIN) })], NOW), "due in 10 minutes: refresh quickly");
  ok(!busySoon([q({ id: "z", status: "failed", scheduled_at: iso(NOW - MIN) })], NOW), "only a failed one: no hurry");
}

// ---- Filters ---------------------------------------------------------------
{
  const day = (t: number) => new Date(t).toISOString().slice(0, 10); // (UTC days, for the test)
  ok(onDay(iso(NOW + 60 * MIN), "today", NOW, day) && !onDay(iso(NOW + 60 * MIN), "tomorrow", NOW, day), "today");
  ok(onDay(iso(NOW + DAY), "tomorrow", NOW, day), "tomorrow");
  ok(onDay(iso(NOW + 6 * DAY), "next7", NOW, day) && !onDay(iso(NOW + 6 * DAY), "later", NOW, day), "within the next 7 days");
  ok(onDay(iso(NOW + 8 * DAY), "later", NOW, day), "later than that");
  ok(onDay(iso(NOW - DAY), "yesterday", NOW, day) && onDay(iso(NOW - DAY), "last7", NOW, day), "yesterday is in the last 7 days");
  ok(!onDay(iso(NOW - 31 * DAY), "last30", NOW, day) && onDay(iso(NOW - 29 * DAY), "last30", NOW, day), "the last 30 days");
  ok(onDay(null, "any", NOW, day) && !onDay(null, "today", NOW, day), "no date: only for any day");
  ok(matchesSearch("#231", "Phone tricks", 231) && matchesSearch("23", "x", 231) && !matchesSearch("31", "x", 231), "#number, and numbers that start so");
  ok(matchesSearch("TRICKS", "Phone tricks", null) && !matchesSearch("battery", "Phone tricks", 1), "words in the title, any case");
  ok(matchesSearch("battery", null, null, "Battery hacks"), "or the other title");
  ok(matchesSearch("  ", null, null), "an empty search matches everything");
  const g = groupByDay([{ t: iso(NOW) }, { t: iso(NOW + MIN) }, { t: iso(NOW + DAY) }, { t: null }], (x) => x.t, day);
  ok(g.map((x) => `${x.day}:${x.items.length}`).join() === "2026-10-15:2,2026-10-16:1,:1", `a group per day, in order (got ${g.map((x) => `${x.day}:${x.items.length}`).join()})`);
}

// ---- A frame as the thumbnail ------------------------------------------------
{
  ok(JSON.stringify(stripCells(1080, 1920)) === JSON.stringify({ cellW: 135, cellH: 240 }), "a tall video: frames 135 × 240");
  ok(JSON.stringify(stripCells(1920, 1080)) === JSON.stringify({ cellW: 192, cellH: 108 }), "a wide one: 192 × 108");
  ok(stripCells(null, null).cellW === 135, "size unknown: taken as tall");
  ok(JSON.stringify(cellsOf(8 * 135 + 38, 240)) === JSON.stringify({ cellW: 135, cellH: 240 }), "the cells from the picture's own size");
  ok(cellsOf(1000, 240) === null && cellsOf(0, 0) === null, "a picture that isn't a strip");
  // A tall frame in a 16:9 box: as high as the box, in the middle; frame 1 starts one frame and a gap in.
  const w = stripWindow({ cellW: 135, cellH: 240 }, 16 / 9);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  ok(near(w.win.height, 1) && near(w.win.width, 135 / 216 / (16 / 9)) && near(w.win.left, (1 - w.win.width) / 2), "a tall frame: the box's height, centred");
  ok(near(w.img.left, -139 / 135) && near(w.img.width, 1118 / 135) && near(w.img.height, 240 / 216), "the strip moved so frame 1 shows, its time cut off below");
  // A wide frame in the same box: the box's width, centred up and down.
  const ww = stripWindow({ cellW: 192, cellH: 108 }, 16 / 9);
  ok(near(ww.win.width, 1) && ww.win.height < 1 && near(ww.win.top, (1 - ww.win.height) / 2), "a wide frame: the box's width, centred");
  // Frame 4 (a quarter in) sits after the wider middle gap.
  ok(near(stripWindow({ cellW: 135, cellH: 240 }, 1, 4).img.left, -(4 * 139 + 10) / 135), "past the middle gap");
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("posting dashboard: all passed");
