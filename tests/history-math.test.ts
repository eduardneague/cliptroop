// YouTube's older numbers (1.21.0): a year per report back to the
// channel's first day, and which days of a report are kept
// (modules/analytics/lib/history-math.ts).
import { historyChunk, historyRows } from "../modules/analytics/lib/history-math";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// A year per report, never before the channel's first day.
const c1 = historyChunk("2026-07-13", "2025-01-27");
ok(c1?.from === "2025-07-14" && c1?.to === "2026-07-13", `a year back (got ${JSON.stringify(c1)})`);
const c2 = historyChunk("2025-07-13", "2025-01-27");
ok(c2?.from === "2025-01-27" && c2?.to === "2025-07-13", `the last stretch stops at the first day (got ${JSON.stringify(c2)})`);
ok(historyChunk("2025-01-26", "2025-01-27") === null, "before the first day: nothing older");
ok(historyChunk("2025-01-27", "2025-01-27")?.from === "2025-01-27", "the first day alone");
ok(historyChunk("2026-01-10", "2020-01-01", 7)?.from === "2026-01-04", "a smaller size");

const base = { team_id: "t", platform: "youtube", updated_at: "now" };
const row = (day: string, views: number, content = "all") => ({ ...base, day, content, views });

// Days before the first views aren't kept; a day left out after it is a zero.
const r = historyRows([row("2025-01-25", 0), row("2025-01-27", 120), row("2025-01-29", 80), row("2025-01-27", 100, "shorts"), row("2025-01-26", 5, "shorts")], "2025-01-20", "2025-01-30", base);
ok(r.first === "2025-01-27", `starts on the first day with views (got ${r.first})`);
const all = r.rows.filter((x) => x.content === "all");
ok(all.map((x) => x.day).join() === "2025-01-27,2025-01-28,2025-01-29,2025-01-30", `every day after it (got ${all.map((x) => x.day).join()})`);
ok(all.find((x) => x.day === "2025-01-28")?.views === 0 && all.find((x) => x.day === "2025-01-30")?.watch_minutes === 0, "the days left out are zeros");
ok(all.find((x) => x.day === "2025-01-28")?.team_id === "t", "with the team");
ok(r.rows.some((x) => x.content === "shorts" && x.day === "2025-01-27"), "Shorts vs long on the days kept");
ok(!r.rows.some((x) => x.day === "2025-01-26"), "nothing before the first day with views (not even Shorts)");
ok(!r.rows.some((x) => x.day === "2025-01-25"), "zeros before it aren't kept");
ok(r.rows.every((x, i, a) => i === 0 || String(a[i - 1].day) <= String(x.day)), "in day order");

// Nothing in it: nothing to save (the channel had no views yet).
const none = historyRows([row("2024-05-01", 0)], "2024-01-01", "2024-12-31", base);
ok(none.first === null && none.rows.length === 0, "a stretch without views saves nothing");

// Rows outside the stretch are left out; views as text count.
const t = historyRows([{ ...base, day: "2023-12-31", content: "all", views: 9 }, { ...base, day: "2024-01-02", content: "all", views: "7" }], "2024-01-01", "2024-01-03", base);
ok(t.first === "2024-01-02" && t.rows.length === 2, `only the stretch's days (got ${t.rows.map((x) => x.day).join()})`);

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("history-math: all passed");
