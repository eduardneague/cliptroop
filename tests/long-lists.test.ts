// 1.32.5: smooth long lists. The shorts list drew every short a team ever made (hundreds of posted ones after a year):
// now posted shorts from before the last two weeks wait behind "Show them" once there are 30 or more of them, every short
// is read (a page of 1000 at a time: one answer stopped at 1000 and the newest went missing), and rows and cards off
// screen in the shorts and long videos lists aren't laid out or painted until they come near (content-visibility).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HIDE_AT_LEAST, HISTORY_DAYS, shiftDay, splitHistory } from "../modules/short-videos/lib/history";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

(async () => {
  // --- The history ----------------------------------------------------------------------------------------------------
  ok(HISTORY_DAYS === 14 && HIDE_AT_LEAST === 30, "two weeks, once there are 30 older ones");
  ok(shiftDay("2026-03-01", -1) === "2026-02-28" && shiftDay("2026-10-25", -14) === "2026-10-11" && shiftDay("2024-03-01", -1) === "2024-02-29", "calendar days (leap years too)");
  const today = "2026-10-25";
  const posted = (n: number, day: string) => Array.from({ length: n }, (_, i) => ({ id: `p${day}-${i}`, stage: "posted", plannedDate: day }));
  const recent = [{ id: "r1", stage: "posted", plannedDate: "2026-10-11" }, { id: "r2", stage: "editing", plannedDate: "2026-10-30" }];
  const overdue = { id: "late", stage: "editing", plannedDate: "2026-01-02" };
  const undated = { id: "nodate", stage: "idea", plannedDate: null };
  const few = splitHistory([...posted(29, "2026-09-01"), ...recent], today, false);
  ok(!few.hiding && !few.offer && few.shown.length === 31 && few.older === 29, "29 older posted shorts: nothing left out (not worth it)");
  const many = splitHistory([...posted(40, "2026-09-01"), overdue, undated, ...recent], today, false);
  ok(many.hiding && many.offer && many.older === 40 && many.cutoff === "2026-10-11", `40: left out, the list from ${many.cutoff}`);
  ok(JSON.stringify(many.shown.map((s) => s.id)) === JSON.stringify(["late", "nodate", "r1", "r2"]), `what's not posted (overdue too), undated, and the last two weeks stay, in order (${many.shown.map((s) => s.id)})`);
  const all = splitHistory([...posted(40, "2026-09-01"), ...recent], today, true);
  ok(!all.hiding && all.offer && all.shown.length === 42, "?past=all: every one, and the way back");
  ok(splitHistory([], today, false).shown.length === 0, "no shorts");

  // --- Every row, a page at a time ------------------------------------------------------------------------------------
  const { allPages, PAGE_ROWS } = await import("../lib/all-pages");
  ok(PAGE_ROWS === 1000, "Supabase's default: 1000 rows an answer");
  const rows = Array.from({ length: 2500 }, (_, i) => i);
  let calls: [number, number][] = [];
  const fake = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
  };
  const got = await allPages(fake);
  ok(got.length === 2500 && got[2499] === 2499 && JSON.stringify(calls) === "[[0,999],[1000,1999],[2000,2999]]", `2500 rows: three pages (${JSON.stringify(calls)})`);
  calls = [];
  ok((await allPages((f, t) => (calls.push([f, t]), Promise.resolve({ data: rows.slice(f, Math.min(t + 1, 300)), error: null })))).length === 300 && calls.length === 1, "300: one answer, as before");
  ok((await allPages(() => Promise.resolve({ data: null, error: { message: "x" } }))).length === 0, "a failed answer: what came before it (none here)");
  const q = read("modules/short-videos/lib/queries.ts");
  ok(/const data = await allPages\(\(from, to\) =>/.test(q) && /\.order\("id", \{ ascending: true \}\)\s*\.range\(from, to\)/.test(q), "listShorts reads every short, in a fixed order across pages");

  // --- Off screen: not drawn (in groups) ------------------------------------------------------------------------------
  const { chunks, LIST_CHUNK, WIDE_CHUNK } = await import("../lib/chunks");
  ok(JSON.stringify(chunks([1, 2, 3, 4, 5], 2)) === "[[1,2],[3,4],[5]]" && chunks([], 24).length === 0 && JSON.stringify(chunks([1, 2], 0)) === "[[1],[2]]", "groups, the last one shorter");
  ok([1, 2, 3, 4].every((n) => LIST_CHUNK % n === 0) && [1, 2, 3, 4, 5, 6].every((n) => WIDE_CHUNK % n === 0), "a group of cards fills whole rows (no gap in the grid where one group ends)");
  const css = read("app/globals.css");
  ok(/\.list-chunk \{ content-visibility: auto; contain-intrinsic-block-size: auto 1450px; \}/.test(css), "a group of rows off screen waits (its height remembered)");
  ok(/\.list-chunk-cards \{ content-visibility: auto; contain-intrinsic-block-size: auto 1800px; padding: 12px; margin: -12px; \}/.test(css), "…cards too, with room to lift and cast their shadow");
  ok(!/\.list-row|\.list-card \{/.test(css), "not each row on its own (a thousand watched rows made scrolling stutter in the harness)");
  const shorts = read("app/(dashboard)/shorts/page.tsx");
  // 1.38.0: the table's rows are drawn by modules/short-videos/components/shorts-table.tsx (the cards stay on the page).
  const table = read("modules/short-videos/components/shorts-table.tsx");
  const groups = /\{chunks\(list, LIST_CHUNK\)\.map\(\(group, g\) => \(/;
  ok(groups.test(table) && /<div key=\{g\} className="list-chunk motion-stagger">/.test(table) && groups.test(shorts) && /<div key=\{g\} className="list-chunk-cards motion-stagger grid /.test(shorts), "the shorts list: rows and cards in groups (each group's rows still cascade in)");
  ok(/const i = g \* LIST_CHUNK \+ k;/.test(table) && /list\[i - 1\]\?\.plannedDate/.test(table), "…a day's heading still knows the short before it, across groups");
  ok(/<div className="flex flex-col gap-4">\s*\{chunks\(list, LIST_CHUNK\)/.test(shorts), "…groups of cards stacked with a gap (margins would fight their room to lift)");
  ok(/const history = splitHistory\(shorts, today, showPast\);\s*const list = history\.shown;/.test(shorts) && !/\{shorts\.map\(/.test(shorts), "…draws what's shown, in both views");
  ok(/past: showPast \? "all" : undefined,/.test(shorts) && /past: showPast \? "all" : null,/.test(shorts), "filters, views and order keep ?past=all");
  ok(/\{!newest && history\.offer && <HistoryBar/.test(shorts) && /\{newest && history\.offer && \(/.test(shorts), "Show them: above the list in schedule order, below it latest first");
  const videos = read("app/(dashboard)/videos/page.tsx");
  ok(/\{chunks\(projects, LIST_CHUNK\)\.map\(\(group, g\) => \(/.test(videos) && /\{chunks\(projects, WIDE_CHUNK\)\.map\(\(group, g\) => \(/.test(videos) && /<div className="flex flex-col gap-5">/.test(videos), "the long videos list: rows and cards (up to 5 across) in groups");
  // Nothing in those rows may open in place: content-visibility clips what's drawn inside a row to the row.
  for (const f of ["components/ui/select.tsx", "components/ui/anchored-menu.tsx", "modules/short-videos/components/keep-shorts-dialog.tsx", "components/ui/dialog.tsx"]) ok(/createPortal\(/.test(read(f)), `${f} opens in a portal`);
  ok(/createPortal\(/.test(read("modules/short-videos/components/row-menu.tsx")), "the shorts row menu too");

  if (fails) {
    console.log(`${fails} FAILED`);
    process.exit(1);
  }
  console.log("long lists: all good");
})();
