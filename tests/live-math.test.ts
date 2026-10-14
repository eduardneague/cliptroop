// One video's live counts (1.19.0): views gained in a stretch of time, a
// change spread over the time between two looks (lib/live-math.ts), the
// same way the database sums them (migration 0083).
import { gainedBetween, hourName, liveDue, perHour, perSlot, snapshotsOf, type LivePoint, type SeenCounts } from "../modules/analytics/lib/live-math";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const H = 3_600_000;
const now = Date.UTC(2026, 9, 13, 12, 30); // 12:30
const pts: LivePoint[] = [
  { at: now - 3 * H, views: 100 },
  { at: now - 2 * H, views: 160 },
  { at: now - 0.5 * H, views: 190 },
];
ok(gainedBetween(pts, now - 48 * H) === 90, `90 in 48 hours (got ${gainedBetween(pts, now - 48 * H)})`);
ok(gainedBetween(pts, now - H) === 10, `the last hour: a third of the 30 (got ${gainedBetween(pts, now - H)})`);
ok(gainedBetween([...pts].reverse(), now - H) === 10, "order doesn't matter");
ok(gainedBetween([{ at: now - H, views: 50 }, { at: now, views: 45 }], 0) === 0, "never negative");
ok(gainedBetween([{ at: now - H, views: null }, { at: now, views: 45 }], 0) === 0, "unknown counts add nothing");
ok(gainedBetween([{ at: now, views: 5 }], 0) === 0, "one look: nothing gained yet");

const hours = perHour(pts, now, 48);
ok(hours.length === 48 && hours[47].at === Date.UTC(2026, 9, 13, 12), "48 hours ending with the hour going on now");
const total = hours.reduce((t, h) => t + h.views, 0);
ok(total >= 89 && total <= 91, `the hours add up to the change (got ${total})`);
// 9:30 → 10:30: 60 views, half in 9:00–10:00 and half in 10:00–11:00;
// 10:30 → 12:00: 30 views, 10 in 10:00–11:00 and 20 in 11:00–12:00.
ok(hours[44].views === 30 && hours[45].views === 40, `spread over the hours it happened in (got ${hours[44].views}, ${hours[45].views})`);
ok(hours[46].views === 20 && hours[47].views === 0 && hours[43].views === 0, `then 20, and nothing since the last look (got ${hours[46].views}, ${hours[47].views})`);

// LIVE_MINUTES: every 10 minutes (the default), or fewer of the timer's calls.
const atMin = (m: number) => new Date(Date.UTC(2026, 9, 13, 12, m));
ok([5, 15, 25, 35, 45, 55].every((m) => liveDue(atMin(m), NaN)), "default: every call");
ok([5, 25, 45].every((m) => liveDue(atMin(m), 20)) && ![15, 35, 55].some((m) => liveDue(atMin(m), 20)), "20 minutes: every other call");
ok(liveDue(atMin(5), 30) && liveDue(atMin(35), 30) && !liveDue(atMin(15), 30) && !liveDue(atMin(45), 30), "30 minutes: :05 and :35");
ok(liveDue(atMin(5), 60) && ![15, 25, 35, 45, 55].some((m) => liveDue(atMin(m), 60)), "60 minutes: :05 only");
ok(liveDue(atMin(15), 7) && liveDue(atMin(15), 15), "anything else: every call");

// What a read keeps (lib/live.ts saveLive).
const NOW = "2026-10-13T12:05:00.000Z";
const seen = new Map<string, SeenCounts>([
  ["same", { views: 100, likes: 5, comments: 1, shares: null, liveAt: "2026-10-13T11:55:00.000Z", updatedAt: "2026-10-13T11:55:00.000Z" }],
  ["up", { views: 100, likes: 5, comments: 1, shares: null, liveAt: "2026-10-13T11:55:00.000Z", updatedAt: "2026-10-13T11:55:00.000Z" }],
  ["morning", { views: 100, likes: 5, comments: 1, shares: null, liveAt: null, updatedAt: "2026-10-13T05:12:00.000Z" }],
  ["morningSame", { views: 100, likes: 5, comments: 1, shares: null, liveAt: null, updatedAt: "2026-10-13T05:12:00.000Z" }],
  ["thisRun", { views: 100, likes: 9, comments: 1, shares: null, liveAt: NOW, updatedAt: NOW }],
  ["ancient", { views: 100, likes: 5, comments: 1, shares: null, liveAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }],
  ["noCounts", { views: null, likes: null, comments: null, shares: null, liveAt: null, updatedAt: "2026-10-13T05:12:00.000Z" }],
]);
const read = [
  { id: "new", counts: { views: 10, likes: 1, comments: 0 } },
  { id: "same", counts: { views: 100, likes: 5, comments: 1 } },
  { id: "up", counts: { views: 130, likes: 6, comments: 1 } },
  { id: "morning", counts: { views: 160, likes: 5, comments: 1 } },
  { id: "morningSame", counts: { views: 100, likes: 5, comments: 1 } },
  { id: "thisRun", counts: { views: 140 } },
  { id: "ancient", counts: { views: 120, likes: 5, comments: 1 } },
  { id: "noCounts", counts: { views: null, likes: null } },
];
const all3 = snapshotsOf(read.filter((r) => r.id !== "thisRun"), seen, ["views", "likes", "comments"], NOW);
const freshIds = all3.fresh.map((x) => x.id).sort().join(",");
const beforeIds = all3.before.map((x) => `${x.id}@${x.at.slice(11, 16)}`).sort().join(",");
ok(freshIds === "ancient,morning,morningSame,new,up", `kept now: new, changed, first looks (got ${freshIds})`);
ok(beforeIds === "morning@05:12,up@11:55", `and the counts as last seen when they changed (got ${beforeIds})`);
ok(all3.fresh.find((x) => x.id === "up")!.views === 130 && all3.before.find((x) => x.id === "up")!.views === 100, "new and old counts");
ok(all3.fresh.find((x) => x.id === "up")!.shares === null, "a count this read doesn't have keeps what's stored");
const views = snapshotsOf(read.filter((r) => r.id === "thisRun"), seen, ["views", "shares"], NOW);
ok(views.fresh.length === 1 && views.fresh[0].likes === 9 && views.fresh[0].views === 140, "views read later in the same run: the likes stay");
ok(views.before.length === 0, "nothing before a moment of this same run");

// Tooltips' hour names (in the machine's time zone, like the browser's).
const base = new Date(2026, 9, 13, 15, 20).getTime();
ok(hourName(new Date(2026, 9, 13, 15).getTime(), base) === "Today, 3 PM", `today (got ${hourName(new Date(2026, 9, 13, 15).getTime(), base)})`);
ok(hourName(new Date(2026, 9, 12, 23).getTime(), base) === "Yesterday, 11 PM", "yesterday");
ok(/^[A-Z][a-z]{2}, 9 AM$/.test(hourName(new Date(2026, 9, 11, 9).getTime(), base)), "before that: the weekday");

// 1.21.0: a video's last 60 minutes in 10-minute slots, ending now.
const slots = perSlot([{ at: now - 50 * 60_000, views: 1000 }, { at: now - 10 * 60_000, views: 1240 }], now, 6, 600_000);
ok(slots.length === 6 && slots[5].at === now - 600_000, "six slots ending now");
ok(slots.reduce((t, x) => t + x.views, 0) === 240, `they add up to the views gained (got ${slots.reduce((t, x) => t + x.views, 0)})`);
ok(slots[0].views === 0 && slots[1].views === 60 && slots[5].views === 0, `spread over the 40 minutes between the looks (got ${slots.map((x) => x.views).join()})`);

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("live math: all good");
